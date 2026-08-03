import { pool, query } from "./db.js";
import {
  getDemoApiListings,
  mergeDbListingsWithDemoCatalog,
} from "./demo-catalog-api.js";
import { isServerDemoCatalogEnabled } from "./demo-catalog-env.js";
import { stripExpiredVisibilityAttributes } from "./shared/promote-catalog.js";
import { buildListingBoundChatId } from "./shared/chat-thread-id.js";
import {
  computeLaunchPromoExpiresAt,
  isLaunchPromoActive,
  isLaunchPromoExpired,
} from "./shared/launch-promo.js";
import type {
  ApiChatThread,
  ApiEscrowTransaction,
  ApiListing,
  ApiReview,
  ApiServiceLead,
  ApiServiceUrgency,
  ApiSupportReport,
  ApiUser,
} from "./types.js";

type ListingRow = {
  id: string;
  seller_id: string;
  title: string;
  price: string;
  price_label: string | null;
  location: string;
  distance_km: number;
  latitude: number | null;
  longitude: number | null;
  slug: string | null;
  image: string;
  images?: unknown;
  category: string;
  tags: string[];
  contact: string | null;
  has_video: boolean;
  created_at: Date;
  expires_at: Date | null;
  description: string | null;
  attributes: Record<string, unknown> | null;
  status: string | null;
  banned: boolean;
  vin_verified: boolean;
  provider_verified: boolean;
  promoted: boolean;
  min_negotiation_price: string | null;
  appraisal_score: number | null;
  is_verified: boolean;
  requires_review: boolean;
  image_alt: string | null;
  image_title: string | null;
  allow_pastomatas: boolean | null;
};

function parseListingImagesColumn(
  raw: unknown,
  attrs: Record<string, unknown> | null | undefined,
  cover: string
): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    if (typeof u !== "string") return;
    const t = u.trim();
    if (!/^https?:\/\//i.test(t)) return;
    if (/unsplash\.com|picsum\.photos/i.test(t)) return;
    // Reject HTML listing pages mistaken for media.
    if (/\/listing\//i.test(t) && !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(t)) {
      return;
    }
    out.push(t);
  };
  if (Array.isArray(raw)) {
    for (const u of raw) push(u);
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) for (const u of parsed) push(u);
    } catch {
      /* ignore */
    }
  }
  const gallery = attrs?.galleryUrls;
  if (Array.isArray(gallery)) for (const u of gallery) push(u);
  push(cover);
  return [...new Set(out)];
}

function mapListingRow(r: ListingRow): ApiListing {
  const stripped = stripExpiredVisibilityAttributes(
    (r.attributes as Record<string, unknown> | null) ?? undefined,
    Boolean(r.promoted)
  );
  const attrs =
    (stripped.attributes as Record<string, unknown> | undefined) ?? undefined;
  const images = parseListingImagesColumn(r.images, attrs, r.image);
  const cover = images[0] ?? r.image ?? "";
  const nextAttrs: Record<string, unknown> = { ...(attrs ?? {}) };
  if (images.length) nextAttrs.galleryUrls = images;
  return {
    id: r.id,
    sellerId: r.seller_id,
    title: r.title,
    price: Number(r.price),
    priceLabel: r.price_label ?? undefined,
    location: r.location,
    distanceKm: Number(r.distance_km),
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    slug: r.slug ?? undefined,
    image: cover,
    images,
    category: r.category,
    tags: r.tags ?? [],
    contact: r.contact ?? undefined,
    hasVideo: r.has_video,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at?.toISOString(),
    description: r.description ?? undefined,
    attributes: nextAttrs as ApiListing["attributes"],
    status: r.status ?? undefined,
    banned: r.banned,
    vinVerified: r.vin_verified,
    providerVerified: r.provider_verified,
    promoted: stripped.promoted,
    minNegotiationPrice:
      r.min_negotiation_price != null ? Number(r.min_negotiation_price) : undefined,
    appraisalScore: r.appraisal_score ?? undefined,
    isVerified: r.is_verified,
    requiresReview: r.requires_review,
    imageAlt: r.image_alt ?? undefined,
    imageTitle: r.image_title ?? undefined,
    allowPastomatas: r.allow_pastomatas ?? true,
    isDemo: false,
  };
}

const LISTING_SELECT = `SELECT id, seller_id, title, price, price_label, location, distance_km,
  latitude, longitude, slug, image,
  COALESCE(images, '[]'::jsonb) AS images,
  category, tags, contact, has_video, created_at, expires_at,
  description, attributes, status, banned, vin_verified, provider_verified, promoted,
  min_negotiation_price, appraisal_score,
  is_verified, requires_review, image_alt, image_title,
  allow_pastomatas
  FROM listings`;

/**
 * Light SELECT for feeds + keyword search — strips inline data-URL blobs so
 * list JSON stays small and search SQL stays under Render timeouts. Detail
 * views keep full LISTING_SELECT (by id). Agent pins hydrate http(s) covers
 * from the catalog; empty cover falls back to placeholder in UI.
 */
const LISTING_SEARCH_SELECT = `SELECT id, seller_id, title, price, price_label, location, distance_km,
  latitude, longitude, slug,
  CASE WHEN image LIKE 'data:%' THEN '' ELSE COALESCE(image, '') END AS image,
  COALESCE(images, '[]'::jsonb) AS images,
  category, tags, contact, has_video, created_at, expires_at,
  description, attributes, status, banned, vin_verified, provider_verified, promoted,
  min_negotiation_price, appraisal_score,
  is_verified, requires_review, image_alt, image_title,
  allow_pastomatas
  FROM listings`;

/** Public feed / page queries — same light projection as search. */
const LISTING_FEED_SELECT = LISTING_SEARCH_SELECT;

/** Public catalog — excludes banned and pending moderation review. */
export const PUBLIC_LISTING_VISIBILITY_SQL = `NOT banned AND COALESCE(requires_review, false) = false AND COALESCE(status, 'active') NOT IN ('deleted', 'sold', 'archived')`;

export async function getUser(id: string): Promise<ApiUser | null> {
  type UserRow = {
    id: string;
    name: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    phone: string;
    city: string;
    avatar_url: string | null;
    email: string | null;
    warned: boolean;
    wallet_balance: string;
    role: string;
    business_type: string | null;
    sold_count: number;
    auth_provider: string | null;
    billing_plan: string | null;
    referral_code: string | null;
    free_protection_credits: number | null;
    free_top_boost_credits?: number | null;
    referred_by_user_id: string | null;
    profile_type: string | null;
    age_group: string | null;
    gender: string | null;
    hobbies: string[] | null;
    company_name?: string | null;
    company_code?: string | null;
    vat_code?: string | null;
    service_base_city?: string | null;
    business_hours?: unknown;
  };

  const mapRow = (r: UserRow): ApiUser => ({
    id: r.id,
    name: r.name,
    firstName: r.first_name ?? undefined,
    lastName: r.last_name ?? undefined,
    nickname: r.nickname ?? undefined,
    phone: r.phone,
    city: r.city,
    email: r.email ?? undefined,
    warned: r.warned,
    walletBalance: Number(r.wallet_balance),
    role: r.role,
    businessType: r.business_type ?? undefined,
    soldCount: r.sold_count,
    authProvider: r.auth_provider ?? undefined,
    billingPlan: r.billing_plan ?? undefined,
    referralCode: r.referral_code ?? undefined,
    freeProtectionCredits: r.free_protection_credits ?? 0,
    freeTopBoostCredits: r.free_top_boost_credits ?? 0,
    referredByUserId: r.referred_by_user_id ?? undefined,
    profileType:
      r.profile_type === "private" || r.profile_type === "business"
        ? r.profile_type
        : undefined,
    ageGroup:
      r.age_group === "Youth" || r.age_group === "Adult" || r.age_group === "Senior"
        ? (r.age_group as ApiUser["ageGroup"])
        : undefined,
    gender:
      r.gender === "Male" || r.gender === "Female" || r.gender === "PreferNot"
        ? (r.gender as ApiUser["gender"])
        : undefined,
    hobbies: Array.isArray(r.hobbies) ? r.hobbies.filter(Boolean).map(String) : undefined,
    companyName: r.company_name ?? undefined,
    companyCode: r.company_code ?? undefined,
    vatCode: r.vat_code ?? undefined,
    serviceBaseCity: r.service_base_city ?? undefined,
    businessHours:
      r.business_hours && typeof r.business_hours === "object"
        ? (r.business_hours as ApiUser["businessHours"])
        : undefined,
    avatar:
      r.avatar_url ??
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
  });

  async function attachBillingTrial(user: ApiUser): Promise<ApiUser> {
    try {
      const subs = await query<{
        expires_at: Date | string | null;
        plan_id: string;
        id: string;
      }>(
        `SELECT id, plan_id, expires_at FROM billing_subscriptions
         WHERE user_id = $1 AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.id]
      );
      const sub = subs[0];
      if (!sub) return user;
      const expiresAt =
        sub.expires_at == null
          ? undefined
          : typeof sub.expires_at === "string"
            ? sub.expires_at
            : new Date(sub.expires_at).toISOString();
      if (!expiresAt) {
        return { ...user, billingExpiresAt: undefined };
      }
      if (isLaunchPromoExpired(expiresAt)) {
        await query(
          `UPDATE billing_subscriptions SET status = 'expired' WHERE id = $1`,
          [sub.id]
        );
        await query(`UPDATE users SET billing_plan = 'free' WHERE id = $1`, [
          user.id,
        ]);
        return {
          ...user,
          billingPlan: "free",
          billingExpiresAt: expiresAt,
        };
      }
      return { ...user, billingExpiresAt: expiresAt };
    } catch {
      return user;
    }
  }

  try {
    const rows = await query<UserRow>(
      `SELECT id, name, first_name, last_name, nickname, phone, city, avatar_url, email, warned,
              wallet_balance, role, business_type, sold_count, auth_provider,
              billing_plan, referral_code, free_protection_credits,
              COALESCE(free_top_boost_credits, 0) AS free_top_boost_credits,
              referred_by_user_id,
              profile_type,
              age_group, gender, hobbies,
              company_name, company_code, vat_code, service_base_city, business_hours
       FROM users WHERE id = $1`,
      [id]
    );
    const r = rows[0];
    if (!r) return null;
    return attachBillingTrial(mapRow(r));
  } catch {
    // Pre-migration fallback if newer columns are missing.
    const rows = await query<UserRow>(
      `SELECT id, name, first_name, last_name, nickname, phone, city, avatar_url, email, warned,
              wallet_balance, role, business_type, sold_count, auth_provider,
              billing_plan, referral_code, free_protection_credits, referred_by_user_id,
              profile_type,
              age_group, gender, hobbies
       FROM users WHERE id = $1`,
      [id]
    );
    const r = rows[0];
    if (!r) return null;
    return attachBillingTrial(mapRow(r));
  }
}

/** Find user by normalized phone digits — used for duplicate-registration guards. */
export async function getUserByPhoneDigits(
  digits: string
): Promise<ApiUser | null> {
  const normalized = digits.replace(/\D/g, "");
  if (normalized.length < 8) return null;
  const rows = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE regexp_replace(phone, '\\D', '', 'g') = $1
     LIMIT 1`,
    [normalized]
  );
  const id = rows[0]?.id;
  return id ? getUser(id) : null;
}

/** Find user by email — links OAuth sign-in to an existing account. */
export async function getUserByEmail(email: string): Promise<ApiUser | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  const rows = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE lower(trim(email)) = $1
     LIMIT 1`,
    [normalized]
  );
  const id = rows[0]?.id;
  return id ? getUser(id) : null;
}

/** Stub user row so chat_messages.sender_id FK never fails (incl. system senders). */
export async function ensureUser(id: string): Promise<void> {
  const safeId = String(id ?? "").trim();
  if (!safeId || safeId === "guest") return;
  const name =
    safeId === "vauto-system"
      ? "VAUTO Sistema"
      : safeId === "vauto-admin-ai"
        ? "VAUTO Admin AI"
        : "Vartotojas";
  await query(
    `INSERT INTO users (id, name, phone, city)
     VALUES ($1, $2, '+370', 'Lietuva')
     ON CONFLICT (id) DO NOTHING`,
    [safeId, name]
  );
}

/** Persist avatar URL — returns row after write for audit logging. */
export async function updateUserAvatar(
  userId: string,
  avatarUrl: string
): Promise<ApiUser | null> {
  await query(
    `UPDATE users SET avatar_url = $1 WHERE id = $2`,
    [avatarUrl, userId]
  );
  const updatedUser = await getUser(userId);
  return updatedUser;
}

export async function updateUserProfile(
  userId: string,
  patch: {
    firstName?: string;
    lastName?: string;
    nickname?: string;
    name: string;
  }
): Promise<ApiUser | null> {
  await query(
    `UPDATE users SET
       first_name = COALESCE($2, first_name),
       last_name = COALESCE($3, last_name),
       nickname = COALESCE($4, nickname),
       name = CASE
         WHEN $5::text IS NULL OR btrim($5) = '' THEN name
         ELSE $5
       END,
       updated_at = now()
     WHERE id = $1`,
    [
      userId,
      patch.firstName ?? null,
      patch.lastName ?? null,
      patch.nickname ?? null,
      patch.name,
    ]
  );
  return getUser(userId);
}

export async function setUserProfileType(
  userId: string,
  profileType: "private" | "business"
): Promise<ApiUser | null> {
  await ensureUser(userId);
  await query(
    `UPDATE users SET profile_type = $2, updated_at = now()
     WHERE id = $1 AND profile_type IS NULL`,
    [userId, profileType]
  );
  return getUser(userId);
}

export async function upsertUser(user: ApiUser): Promise<void> {
  const baseParams = [
    user.id,
    user.name,
    user.phone,
    user.city,
    user.avatar,
    user.email ?? null,
    user.warned ?? false,
    user.walletBalance ?? 0,
    user.role ?? "private",
    user.businessType ?? null,
    user.soldCount ?? 0,
    user.authProvider ?? null,
    user.profileType ?? null,
    user.ageGroup ?? null,
    user.gender ?? null,
    user.hobbies ?? null,
  ];
  try {
    await query(
      `INSERT INTO users (id, name, phone, city, avatar_url, email, warned,
                          wallet_balance, role, business_type, sold_count, auth_provider, profile_type,
                          age_group, gender, hobbies,
                          company_name, company_code, vat_code, service_base_city, business_hours,
                          first_name, last_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, $18, $19, $20, $21, $22, $23)
       ON CONFLICT (id) DO UPDATE SET
         name = CASE
           WHEN EXCLUDED.name IS NULL OR btrim(EXCLUDED.name) = '' THEN users.name
           WHEN lower(EXCLUDED.name) IN ('apple vartotojas', 'google vartotojas', 'mobilus vartotojas')
                AND users.name IS NOT NULL
                AND lower(users.name) NOT IN ('apple vartotojas', 'google vartotojas', 'mobilus vartotojas')
             THEN users.name
           ELSE EXCLUDED.name
         END,
         phone = EXCLUDED.phone,
         city = EXCLUDED.city,
         avatar_url = EXCLUDED.avatar_url,
         email = COALESCE(EXCLUDED.email, users.email),
         warned = EXCLUDED.warned,
         wallet_balance = COALESCE(EXCLUDED.wallet_balance, users.wallet_balance),
         role = COALESCE(EXCLUDED.role, users.role),
         business_type = COALESCE(EXCLUDED.business_type, users.business_type),
         sold_count = COALESCE(EXCLUDED.sold_count, users.sold_count),
         auth_provider = COALESCE(EXCLUDED.auth_provider, users.auth_provider),
         profile_type = COALESCE(users.profile_type, EXCLUDED.profile_type),
         age_group = COALESCE(EXCLUDED.age_group, users.age_group),
         gender = COALESCE(EXCLUDED.gender, users.gender),
         hobbies = COALESCE(EXCLUDED.hobbies, users.hobbies),
         company_name = COALESCE(EXCLUDED.company_name, users.company_name),
         company_code = COALESCE(EXCLUDED.company_code, users.company_code),
         vat_code = COALESCE(EXCLUDED.vat_code, users.vat_code),
         service_base_city = COALESCE(EXCLUDED.service_base_city, users.service_base_city),
         business_hours = COALESCE(EXCLUDED.business_hours, users.business_hours),
         first_name = COALESCE(EXCLUDED.first_name, users.first_name),
         last_name = COALESCE(EXCLUDED.last_name, users.last_name),
         updated_at = now()`,
      [
        ...baseParams,
        user.companyName ?? null,
        user.companyCode ?? null,
        user.vatCode ?? null,
        user.serviceBaseCity ?? null,
        user.businessHours ?? null,
        user.firstName ?? null,
        user.lastName ?? null,
      ]
    );
  } catch {
    await query(
      `INSERT INTO users (id, name, phone, city, avatar_url, email, warned,
                          wallet_balance, role, business_type, sold_count, auth_provider, profile_type,
                          age_group, gender, hobbies)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         city = EXCLUDED.city,
         avatar_url = EXCLUDED.avatar_url,
         email = COALESCE(EXCLUDED.email, users.email),
         warned = EXCLUDED.warned,
         wallet_balance = COALESCE(EXCLUDED.wallet_balance, users.wallet_balance),
         role = COALESCE(EXCLUDED.role, users.role),
         business_type = COALESCE(EXCLUDED.business_type, users.business_type),
         sold_count = COALESCE(EXCLUDED.sold_count, users.sold_count),
         auth_provider = COALESCE(EXCLUDED.auth_provider, users.auth_provider),
         profile_type = COALESCE(users.profile_type, EXCLUDED.profile_type),
         age_group = COALESCE(EXCLUDED.age_group, users.age_group),
         gender = COALESCE(EXCLUDED.gender, users.gender),
         hobbies = COALESCE(EXCLUDED.hobbies, users.hobbies),
         updated_at = now()`,
      baseParams
    );
    if (user.firstName || user.lastName) {
      await updateUserProfile(user.id, {
        firstName: user.firstName,
        lastName: user.lastName,
        nickname: user.nickname,
        name: user.name,
      });
    }
  }
}

export async function getListings(): Promise<ApiListing[]> {
  const page = await getListingsPage({ limit: DEFAULT_LISTINGS_PAGE_SIZE, offset: 0 });
  return page.items;
}

export const DEFAULT_LISTINGS_PAGE_SIZE = 50;

export interface ListingsPageResult {
  items: ApiListing[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

/** Paginated listings — avoids full-table scans on free-tier DB. */
export async function getListingsPage(options: {
  limit?: number;
  offset?: number;
}): Promise<ListingsPageResult> {
  const limit = Math.min(
    Math.max(Number(options.limit) || DEFAULT_LISTINGS_PAGE_SIZE, 1),
    DEFAULT_LISTINGS_PAGE_SIZE
  );
  const offset = Math.max(Number(options.offset) || 0, 0);

  try {
    const countRows = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM listings WHERE ${PUBLIC_LISTING_VISIBILITY_SQL}`
    );
    const total = Number(countRows[0]?.count ?? 0);

    const rows = await query<ListingRow>(
      `${LISTING_FEED_SELECT}
       WHERE ${PUBLIC_LISTING_VISIBILITY_SQL}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const fromDb = rows.map(mapListingRow);
    let items = fromDb;
    if (isServerDemoCatalogEnabled() && offset === 0) {
      items = mergeDbListingsWithDemoCatalog(fromDb);
      items = items.slice(0, limit);
    }

    return {
      items,
      limit,
      offset,
      total,
      hasMore: offset + items.length < total,
    };
  } catch {
    const demo = isServerDemoCatalogEnabled() ? getDemoApiListings() : [];
    const items = demo.slice(offset, offset + limit);
    return {
      items,
      limit,
      offset,
      total: demo.length,
      hasMore: offset + items.length < demo.length,
    };
  }
}

export async function getListingsLegacyFull(): Promise<ApiListing[]> {
  try {
    const rows = await query<ListingRow>(
      `${LISTING_FEED_SELECT} ORDER BY created_at DESC`
    );
    const fromDb = rows.map(mapListingRow);
    if (!isServerDemoCatalogEnabled()) {
      return fromDb;
    }
    return mergeDbListingsWithDemoCatalog(fromDb);
  } catch {
    return isServerDemoCatalogEnabled() ? getDemoApiListings() : [];
  }
}

export async function getListingsPendingReview(limit = 100): Promise<ApiListing[]> {
  try {
    const rows = await query<ListingRow>(
      `${LISTING_SELECT}
       WHERE requires_review = true AND NOT banned
         AND COALESCE(status, 'active') NOT IN ('deleted', 'sold', 'archived')
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    );
    return rows.map(mapListingRow);
  } catch {
    const all = await getListingsLegacyFull();
    return all
      .filter((l) => l.requiresReview && !l.banned && l.status !== "sold")
      .slice(0, limit);
  }
}

export async function getSellerListings(sellerId: string): Promise<ApiListing[]> {
  try {
    // Include soft-deleted so seller can restore; public feed still hides them.
    const rows = await query<ListingRow>(
      `${LISTING_SELECT}
       WHERE seller_id = $1
         AND COALESCE(status, 'active') NOT IN ('archived')
       ORDER BY
         CASE WHEN COALESCE(status, 'active') = 'deleted' THEN 1 ELSE 0 END,
         created_at DESC`,
      [sellerId]
    );
    return rows.map(mapListingRow);
  } catch {
    const all = await getListingsLegacyFull();
    return all.filter(
      (l) => l.sellerId === sellerId && l.status !== "archived"
    );
  }
}

export interface ListingSearchParams {
  query?: string;
  category?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
}

/** Mazgas 3: Gemini query → SQL ILIKE (be stop-žodžių). */
function sqlSearchTokens(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .normalize("NFC")
        .split(/[\s,.;:!?—–-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    ),
  ];
}

/** Modifikatoriai (dydis, spalva…) — ne produkto pavadinimas; gali sutapti per attributes. */
const SEARCH_MODIFIER_TOKENS = new Set([
  "dydžio",
  "dydis",
  "dydzio",
  "spalvos",
  "spalva",
  "naudotas",
  "naujas",
  "nauja",
  "būklės",
  "bukles",
  "būklė",
  "bukle",
  "metų",
  "metu",
  "cm",
  "mm",
  "kg",
]);

function isNumericSearchToken(token: string): boolean {
  return /^\d+([.,]\d+)?$/.test(token);
}

/** Produktų žodžiai (pvz. „batai“) — privalo sutapti title, ne tik kategorijoje. */
function isPrimarySearchToken(token: string): boolean {
  if (token.length < 2) return false;
  if (isNumericSearchToken(token)) return false;
  if (SEARCH_MODIFIER_TOKENS.has(token)) return false;
  return true;
}

function splitSearchTokens(tokens: string[]): {
  primary: string[];
  secondary: string[];
} {
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const t of tokens) {
    if (isPrimarySearchToken(t)) primary.push(t);
    else secondary.push(t);
  }
  return { primary, secondary };
}

/**
 * LT declension-tolerant variants: batų/batus → batai, gitarą → gitara, haskio → haskis.
 * Kept small and deterministic (no full morphological DB).
 */
function expandLtSearchToken(token: string): string[] {
  const t = token.toLowerCase().normalize("NFC");
  const variants = new Set<string>([t]);
  if (t.length < 3) return [...variants];

  const stem = t.replace(
    /(omis|uose|yse|ams|ais|ių|ų|us|as|ės|ei|ę|ą|į|io|is|ė)$/u,
    ""
  );
  if (stem.length >= 3 && stem !== t) {
    variants.add(stem);
    for (const suf of ["ai", "as", "a", "ė", "is", "ys"]) {
      variants.add(stem + suf);
    }
  }
  // Common noun shortcuts
  if (/^bat/.test(t)) {
    variants.add("batai");
    variants.add("batas");
  }
  if (/^hask[iy]?/.test(t) || /^hasik/.test(t)) {
    variants.add("haskis");
    variants.add("haski");
  }
  return [...variants].filter((v) => v.length >= 2).slice(0, 6);
}

function tokenMatchesHaystack(haystack: string, token: string): boolean {
  return expandLtSearchToken(token).some((v) => haystack.includes(v));
}

function listingHaystack(listing: ApiListing): string {
  return [
    listing.title,
    listing.description ?? "",
    listing.category,
    ...(listing.tags ?? []),
    JSON.stringify(listing.attributes ?? {}),
  ]
    .join(" ")
    .toLowerCase()
    .normalize("NFC");
}

function listingSecondaryHaystack(listing: ApiListing): string {
  return [
    listing.title,
    listing.description ?? "",
    ...(listing.tags ?? []),
    JSON.stringify(listing.attributes ?? {}),
  ]
    .join(" ")
    .toLowerCase()
    .normalize("NFC");
}

function listingMatchesSqlTokens(listing: ApiListing, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const { primary, secondary } = splitSearchTokens(tokens);
  const titleLower = listing.title.toLowerCase().normalize("NFC");
  const fullHaystack = listingHaystack(listing);
  const secondaryHay = listingSecondaryHaystack(listing);

  if (primary.length) {
    // Prefer title, but accept description/tags/attributes (LT case forms).
    const primaryOk = primary.every(
      (t) => tokenMatchesHaystack(titleLower, t) || tokenMatchesHaystack(fullHaystack, t)
    );
    if (!primaryOk) return false;
    return secondary.every((t) => tokenMatchesHaystack(secondaryHay, t));
  }

  return tokens.every((t) => tokenMatchesHaystack(fullHaystack, t));
}

function rankByCategoryPreference(
  rows: ApiListing[],
  category?: string
): ApiListing[] {
  if (!category?.trim()) return rows;
  const cat = category.trim();
  const inCat = rows.filter((l) => l.category === cat);
  const rest = rows.filter((l) => l.category !== cat);
  return inCat.length ? [...inCat, ...rest] : rows;
}

function pushTokenFieldMatch(
  conditions: string[],
  values: unknown[],
  idx: number,
  token: string
): number {
  const variants = expandLtSearchToken(token);
  const parts: string[] = [];
  for (const v of variants) {
    parts.push(`(
      LOWER(title) LIKE $${idx} OR
      LOWER(COALESCE(description, '')) LIKE $${idx} OR
      COALESCE(tags::text, '[]') LIKE $${idx} OR
      LOWER(COALESCE(attributes::text, '')) LIKE $${idx}
    )`);
    values.push(`%${v}%`);
    idx++;
  }
  conditions.push(`(${parts.join(" OR ")})`);
  return idx;
}

/** SQL ILIKE pagal Gemini query — niekada negrąžina viso katalogo su query. */
export async function searchListingsFiltered(
  params: ListingSearchParams
): Promise<ApiListing[]> {
  const queryText = params.query?.trim() ?? "";
  const tokens = queryText ? sqlSearchTokens(queryText) : [];
  const cityNorm = params.city?.trim().toLowerCase() ?? "";

  const conditions = [
    "(status IS NULL OR status IS DISTINCT FROM 'sold')",
    "banned = false",
    "COALESCE(requires_review, false) = false",
    // Jobs/services are often price=0 (salary/negotiable); still searchable.
    `(price > 0 OR category IN ('jobs', 'services'))`,
  ];
  const values: unknown[] = [];
  let idx = 1;

  const { primary, secondary } = splitSearchTokens(tokens);
  const softCategoryOnly = Boolean(params.category && primary.length > 0);

  if (params.category && !softCategoryOnly) {
    conditions.push(`category = $${idx++}`);
    values.push(params.category);
  }
  if (params.minPrice != null && !Number.isNaN(params.minPrice)) {
    conditions.push(`price >= $${idx++}`);
    values.push(params.minPrice);
  }
  if (params.maxPrice != null && !Number.isNaN(params.maxPrice)) {
    conditions.push(`price <= $${idx++}`);
    values.push(params.maxPrice);
  }
  if (cityNorm) {
    conditions.push(`LOWER(location) LIKE $${idx++}`);
    values.push(`%${cityNorm}%`);
  }

  for (const token of primary) {
    idx = pushTokenFieldMatch(conditions, values, idx, token);
  }

  for (const token of secondary) {
    idx = pushTokenFieldMatch(conditions, values, idx, token);
  }

  const limit =
    params.limit != null && params.limit > 0 ? Math.min(params.limit, 500) : 500;
  const sql = `${LISTING_SEARCH_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${idx}`;
  values.push(limit);

  let rows: ApiListing[];
  try {
    const dbRows = await query<ListingRow>(sql, values);
    const fromDb = dbRows.map(mapListingRow);
    rows = isServerDemoCatalogEnabled()
      ? mergeDbListingsWithDemoCatalog(fromDb)
      : fromDb;
  } catch (err) {
    console.warn("[searchListingsFiltered] SQL failed:", err);
    if (queryText && !tokens.length) {
      return [];
    }
    rows = await getListings();
    rows = rows.filter(
      (l) =>
        l.status !== "sold" &&
        !l.banned &&
        !l.requiresReview &&
        (l.price > 0 || l.category === "jobs" || l.category === "services")
    );
    if (params.category && !softCategoryOnly) {
      rows = rows.filter((l) => l.category === params.category);
    }
    if (params.minPrice != null && !Number.isNaN(params.minPrice)) {
      rows = rows.filter((l) => l.price >= params.minPrice!);
    }
    if (params.maxPrice != null && !Number.isNaN(params.maxPrice)) {
      rows = rows.filter((l) => l.price <= params.maxPrice!);
    }
    if (cityNorm) {
      rows = rows.filter((l) => l.location.toLowerCase().includes(cityNorm));
    }
    if (queryText && tokens.length) {
      rows = rows.filter((l) => listingMatchesSqlTokens(l, tokens));
      if (!rows.length) {
        return [];
      }
    }
  }

  if (queryText) {
    if (!tokens.length) {
      return [];
    }
    rows = rows.filter((l) => listingMatchesSqlTokens(l, tokens));
    if (!rows.length) {
      return [];
    }
    if (softCategoryOnly) {
      rows = rankByCategoryPreference(rows, params.category);
    }
  }

  return rows.slice(0, limit);
}

/** Stamp public-safe Pro/B2B flags onto listing attributes for feed ranking. */
function stampListingB2bAttributes(
  attributes: Record<string, unknown> | undefined,
  seller: ApiUser | null
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(attributes ?? {}) };
  if (!seller) return next;
  if (seller.role === "pro") next._b2bPro = "true";
  else delete next._b2bPro;
  if (seller.profileType === "business") next._b2bBusiness = "true";
  else delete next._b2bBusiness;
  if (String(seller.companyCode ?? "").trim().length >= 5) {
    next._b2bVerified = "true";
  } else delete next._b2bVerified;
  return next;
}

export async function insertListing(listing: ApiListing): Promise<void> {
  await ensureUser(listing.sellerId);
  const seller = await getUser(listing.sellerId);
  const stampedAttributes = stampListingB2bAttributes(
    listing.attributes as Record<string, unknown> | undefined,
    seller
  ) as Record<string, unknown>;
  const gallery = parseListingImagesColumn(
    listing.images,
    stampedAttributes,
    listing.image
  );
  const cover = gallery[0] ?? listing.image ?? "";
  if (gallery.length) stampedAttributes.galleryUrls = gallery;
  await query(
    `INSERT INTO listings (
      id, seller_id, title, price, price_label, location, distance_km,
      latitude, longitude, slug, image, images, category, tags, contact, has_video,
      created_at, expires_at, description, attributes, status, banned,
      vin_verified, provider_verified, promoted, min_negotiation_price, appraisal_score,
      is_verified, requires_review, image_alt, image_title,
      allow_pastomatas
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      price = EXCLUDED.price,
      location = EXCLUDED.location,
      distance_km = EXCLUDED.distance_km,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      slug = EXCLUDED.slug,
      image = EXCLUDED.image,
      images = EXCLUDED.images,
      expires_at = EXCLUDED.expires_at,
      description = EXCLUDED.description,
      attributes = EXCLUDED.attributes,
      status = EXCLUDED.status,
      banned = EXCLUDED.banned,
      vin_verified = EXCLUDED.vin_verified,
      provider_verified = EXCLUDED.provider_verified,
      promoted = EXCLUDED.promoted,
      min_negotiation_price = EXCLUDED.min_negotiation_price,
      appraisal_score = EXCLUDED.appraisal_score,
      is_verified = EXCLUDED.is_verified,
      requires_review = EXCLUDED.requires_review,
      image_alt = EXCLUDED.image_alt,
      image_title = EXCLUDED.image_title,
      allow_pastomatas = EXCLUDED.allow_pastomatas`,
    [
      listing.id,
      listing.sellerId,
      listing.title,
      listing.price,
      listing.priceLabel ?? null,
      listing.location,
      listing.distanceKm,
      listing.latitude ?? null,
      listing.longitude ?? null,
      listing.slug ?? null,
      cover,
      JSON.stringify(gallery),
      listing.category,
      JSON.stringify(listing.tags),
      listing.contact ?? null,
      listing.hasVideo ?? false,
      listing.createdAt,
      listing.expiresAt ?? null,
      listing.description ?? null,
      JSON.stringify(stampedAttributes),
      listing.status ?? "active",
      listing.banned ?? false,
      listing.vinVerified ?? false,
      listing.providerVerified ?? false,
      listing.promoted ?? false,
      listing.minNegotiationPrice ?? null,
      listing.appraisalScore ?? null,
      listing.isVerified ?? true,
      listing.requiresReview ?? false,
      listing.imageAlt ?? null,
      listing.imageTitle ?? null,
      listing.allowPastomatas ?? true,
    ]
  );

  void import("./ai/listing-embedding.js")
    .then((m) => m.refreshListingEmbedding(listing.id))
    .catch(() => {});
  void import("./ai/image-embedding.js")
    .then((m) => m.refreshListingImageEmbedding(listing.id))
    .catch(() => {});
  void import("./routes/og.js")
    .then((m) => m.bustListingOgCache(listing))
    .catch(() => {});
}

/** Idempotent publish guard — same seller + clientDraftId cannot create duplicates. */
export async function findListingByClientDraftId(
  sellerId: string,
  clientDraftId: string
): Promise<ApiListing | null> {
  const rows = await query<ListingRow>(
    `${LISTING_SELECT}
     WHERE seller_id = $1
       AND attributes->>'clientDraftId' = $2
       AND COALESCE(status, 'active') NOT IN ('deleted')
     ORDER BY created_at DESC
     LIMIT 1`,
    [sellerId, clientDraftId]
  );
  return rows[0] ? mapListingRow(rows[0]) : null;
}

export async function updateListing(
  id: string,
  sellerId: string,
  patch: Partial<ApiListing>
): Promise<ApiListing | null> {
  const rows = await query<{ seller_id: string }>(
    "SELECT seller_id FROM listings WHERE id = $1",
    [id]
  );
  if (!rows[0] || rows[0].seller_id !== sellerId) return null;

  if (patch.status === "sold") {
    const prev = await query<{ status: string | null }>(
      "SELECT status FROM listings WHERE id = $1",
      [id]
    );
    if (prev[0]?.status !== "sold") {
      await query(
        `UPDATE users SET sold_count = sold_count + 1, updated_at = now() WHERE id = $1`,
        [sellerId]
      );
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const set = (col: string, val: unknown) => {
    fields.push(`${col} = $${i++}`);
    values.push(val);
  };

  if (patch.title !== undefined) set("title", patch.title);
  if (patch.price !== undefined) set("price", patch.price);
  if (patch.priceLabel !== undefined) set("price_label", patch.priceLabel);
  if (patch.location !== undefined) set("location", patch.location);
  if (patch.contact !== undefined) set("contact", patch.contact);
  if (patch.description !== undefined) set("description", patch.description);
  if (patch.category !== undefined) set("category", patch.category);
  if (patch.tags !== undefined) set("tags", JSON.stringify(patch.tags));
  if (patch.attributes !== undefined)
    set("attributes", JSON.stringify(patch.attributes));
  if (patch.image !== undefined) set("image", patch.image);
  if (patch.images !== undefined) {
    const gallery = parseListingImagesColumn(
      patch.images,
      patch.attributes as Record<string, unknown> | undefined,
      patch.image ?? ""
    );
    set("images", JSON.stringify(gallery));
    if (gallery[0] && patch.image === undefined) set("image", gallery[0]);
  } else if (patch.attributes !== undefined) {
    const gallery = parseListingImagesColumn(
      undefined,
      patch.attributes as Record<string, unknown> | undefined,
      patch.image ?? ""
    );
    if (gallery.length) {
      set("images", JSON.stringify(gallery));
      if (gallery[0] && patch.image === undefined) set("image", gallery[0]);
    }
  }
  if (patch.status !== undefined) set("status", patch.status);
  if (patch.banned !== undefined) set("banned", patch.banned);
  if (patch.minNegotiationPrice !== undefined)
    set("min_negotiation_price", patch.minNegotiationPrice);
  if (patch.appraisalScore !== undefined) set("appraisal_score", patch.appraisalScore);
  if (patch.isVerified !== undefined) set("is_verified", patch.isVerified);
  if (patch.requiresReview !== undefined) set("requires_review", patch.requiresReview);
  if (patch.imageAlt !== undefined) set("image_alt", patch.imageAlt);
  if (patch.imageTitle !== undefined) set("image_title", patch.imageTitle);
  if (patch.allowPastomatas !== undefined) set("allow_pastomatas", patch.allowPastomatas);

  if (fields.length === 0) {
    return getListingForEmbedding(id);
  }

  values.push(id);
  await query(`UPDATE listings SET ${fields.join(", ")} WHERE id = $${i}`, values);

  const needsEmbed =
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.category !== undefined ||
    patch.tags !== undefined ||
    patch.attributes !== undefined;

  if (needsEmbed) {
    void import("./ai/listing-embedding.js")
      .then((m) => m.refreshListingEmbedding(id))
      .catch(() => {});
  }

  if (patch.image !== undefined || needsEmbed) {
    void import("./ai/image-embedding.js")
      .then((m) => m.refreshListingImageEmbedding(id))
      .catch(() => {});
  }

  // Return by id (not public feed filter) so review-flag patches still resolve.
  const updated = await getListingForEmbedding(id);
  if (updated) {
    void import("./routes/og.js")
      .then((m) => m.bustListingOgCache(updated))
      .catch(() => {});
  }
  return updated;
}

/** Admin-only patch — does not require seller_id match. */
export async function adminPatchListing(
  id: string,
  patch: Partial<
    Pick<ApiListing, "banned" | "status" | "requiresReview" | "image">
  >
): Promise<ApiListing | null> {
  const rows = await query<{ id: string }>(
    "SELECT id FROM listings WHERE id = $1",
    [id]
  );
  if (!rows[0]) return null;

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const set = (col: string, val: unknown) => {
    fields.push(`${col} = $${i++}`);
    values.push(val);
  };

  if (patch.banned !== undefined) set("banned", patch.banned);
  if (patch.status !== undefined) set("status", patch.status);
  if (patch.requiresReview !== undefined) set("requires_review", patch.requiresReview);
  if (patch.image !== undefined) set("image", patch.image);

  if (fields.length === 0) {
    return getListingForEmbedding(id);
  }

  values.push(id);
  await query(`UPDATE listings SET ${fields.join(", ")} WHERE id = $${i}`, values);

  return getListingForEmbedding(id);
}

export async function renewListing(
  id: string,
  sellerId: string
): Promise<ApiListing | null> {
  const rows = await query<{ created_at: Date }>(
    "SELECT created_at FROM listings WHERE id = $1 AND seller_id = $2",
    [id, sellerId]
  );
  if (!rows[0]) return null;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  await query(
    `UPDATE listings SET expires_at = $1, created_at = now() WHERE id = $2 AND seller_id = $3`,
    [expiresAt.toISOString(), id, sellerId]
  );

  const all = await getListings();
  return all.find((l) => l.id === id) ?? null;
}

/** Soft-delete — hides from public catalog; seller can restore via status=active. */
export async function deleteListing(id: string, sellerId: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE listings
     SET status = 'deleted'
     WHERE id = $1
       AND seller_id = $2
       AND COALESCE(status, 'active') <> 'deleted'`,
    [id, sellerId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Alias — soft-hide from catalog (same as deleteListing). */
export async function hideListing(id: string, sellerId: string): Promise<boolean> {
  return deleteListing(id, sellerId);
}

function collectListingMediaUrls(listing: ApiListing): string[] {
  const urls: string[] = [];
  if (listing.image?.trim()) urls.push(listing.image.trim());
  const attrs = listing.attributes ?? {};
  for (const key of ["galleryUrls", "images", "imageUrls", "orderedImageUrls"] as const) {
    const raw = attrs[key];
    if (Array.isArray(raw)) {
      for (const u of raw) {
        if (typeof u === "string" && u.trim()) urls.push(u.trim());
      }
    } else if (typeof raw === "string" && raw.trim()) {
      urls.push(raw.trim());
    }
  }
  return [...new Set(urls)];
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table]
  );
  return Boolean(rows[0]?.exists);
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column]
  );
  return Boolean(rows[0]?.exists);
}

/**
 * Permanent seller delete — removes DB row + dependents and best-effort Cloudinary media.
 * Soft-hidden (`status=deleted`) listings can also be purged.
 */
export async function permanentlyDeleteListing(
  id: string,
  sellerId: string
): Promise<{ ok: boolean; media?: { attempted: number; destroyed: number; skipped: number } }> {
  const listing = await getListingForEmbedding(id);
  if (!listing || listing.sellerId !== sellerId) {
    return { ok: false };
  }

  const mediaUrls = collectListingMediaUrls(listing);
  let mediaResult = { attempted: 0, destroyed: 0, skipped: 0 };
  try {
    const { destroyCloudinaryByUrls } = await import("./ai/cloudinary.js");
    mediaResult = await destroyCloudinaryByUrls(mediaUrls);
  } catch (e) {
    console.warn(
      "[listings] Cloudinary cleanup failed (continuing hard delete):",
      e instanceof Error ? e.message : e
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ownerCheck = await client.query(
      `SELECT id FROM listings WHERE id = $1 AND seller_id = $2 FOR UPDATE`,
      [id, sellerId]
    );
    if ((ownerCheck.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false };
    }

    const dependents = [
      "saved_listings",
      "listing_views",
      "listing_analytics",
      "chat_threads",
      "chats",
      "offers",
      "reports",
      "support_reports",
      "wishlist_matches",
      "listing_embeddings",
      "image_embeddings",
    ];

    for (const table of dependents) {
      if (!(await tableExists(table))) continue;
      if (!(await columnExists(table, "listing_id"))) continue;
      await client.query(`DELETE FROM ${table} WHERE listing_id = $1`, [id]);
    }

    const del = await client.query(
      `DELETE FROM listings WHERE id = $1 AND seller_id = $2`,
      [id, sellerId]
    );
    if ((del.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false };
    }

    await client.query("COMMIT");
    return { ok: true, media: mediaResult };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function restoreListing(
  id: string,
  sellerId: string
): Promise<ApiListing | null> {
  const res = await pool.query(
    `UPDATE listings
     SET status = 'active'
     WHERE id = $1
       AND seller_id = $2
       AND COALESCE(status, 'active') = 'deleted'`,
    [id, sellerId]
  );
  if ((res.rowCount ?? 0) === 0) return null;
  return getListingForEmbedding(id);
}

export async function getSavedIds(userId: string): Promise<string[]> {
  const rows = await query<{ listing_id: string }>(
    "SELECT listing_id FROM saved_listings WHERE user_id = $1",
    [userId]
  );
  return rows.map((r) => r.listing_id);
}

export async function setSavedIds(userId: string, ids: string[]): Promise<void> {
  await ensureUser(userId);
  await pool.query("DELETE FROM saved_listings WHERE user_id = $1", [userId]);
  for (const listingId of ids) {
    await pool.query(
      `INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, listingId]
    );
  }
}

export async function getReports(): Promise<ApiSupportReport[]> {
  const rows = await query<{
    id: string;
    reporter_id: string;
    reporter_name: string;
    category: string;
    urgency: string;
    status: string;
    comment: string;
    listing_id: string | null;
    listing_title: string | null;
    chat_id: string | null;
    reported_user_id: string | null;
    chat_preview: string | null;
    created_at: Date;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, reporter_id, reporter_name, category, urgency, status, comment,
            listing_id, listing_title, chat_id, reported_user_id, chat_preview, created_at,
            COALESCE(metadata, '{}'::jsonb) AS metadata
     FROM support_reports ORDER BY created_at DESC`
  );
  return rows.map((r) => mapReportFromRow(r));
}

function mapReportFromRow(r: {
  id: string;
  reporter_id: string;
  reporter_name: string;
  category: string;
  urgency: string;
  status: string;
  comment: string;
  listing_id: string | null;
  listing_title: string | null;
  chat_id: string | null;
  reported_user_id: string | null;
  chat_preview: string | null;
  created_at: Date;
  metadata: Record<string, unknown> | null;
}): ApiSupportReport {
  const meta = r.metadata ?? {};
  return {
    id: r.id,
    reporterId: r.reporter_id,
    reporterName: r.reporter_name,
    category: r.category,
    urgency: r.urgency,
    status: r.status,
    comment: r.comment,
    listingId: r.listing_id ?? undefined,
    listingTitle: r.listing_title ?? undefined,
    chatId: r.chat_id ?? undefined,
    reportedUserId: r.reported_user_id ?? undefined,
    chatPreview: r.chat_preview ?? undefined,
    createdAt: r.created_at.toISOString(),
    reporterEmail: meta.reporterEmail as string | undefined,
    reporterPhone: meta.reporterPhone as string | undefined,
    reportedUserName: meta.reportedUserName as string | undefined,
    updatedAt: meta.updatedAt as string | undefined,
    messages: meta.messages as unknown[] | undefined,
    aiSummary: meta.aiSummary as string | undefined,
    aiSuggestedReply: meta.aiSuggestedReply as string | undefined,
    unreadByAdmin: meta.unreadByAdmin as boolean | undefined,
    unreadByReporter: meta.unreadByReporter as boolean | undefined,
    aiPowered: meta.aiPowered as boolean | undefined,
  };
}

export async function getReportById(
  id: string
): Promise<ApiSupportReport | null> {
  const rows = await query<{
    id: string;
    reporter_id: string;
    reporter_name: string;
    category: string;
    urgency: string;
    status: string;
    comment: string;
    listing_id: string | null;
    listing_title: string | null;
    chat_id: string | null;
    reported_user_id: string | null;
    chat_preview: string | null;
    created_at: Date;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, reporter_id, reporter_name, category, urgency, status, comment,
            listing_id, listing_title, chat_id, reported_user_id, chat_preview, created_at,
            COALESCE(metadata, '{}'::jsonb) AS metadata
     FROM support_reports WHERE id = $1`,
    [id]
  );
  const row = rows[0];
  return row ? mapReportFromRow(row) : null;
}

export async function getReportsByReporter(
  reporterId: string
): Promise<ApiSupportReport[]> {
  const rows = await query<{
    id: string;
    reporter_id: string;
    reporter_name: string;
    category: string;
    urgency: string;
    status: string;
    comment: string;
    listing_id: string | null;
    listing_title: string | null;
    chat_id: string | null;
    reported_user_id: string | null;
    chat_preview: string | null;
    created_at: Date;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, reporter_id, reporter_name, category, urgency, status, comment,
            listing_id, listing_title, chat_id, reported_user_id, chat_preview, created_at,
            COALESCE(metadata, '{}'::jsonb) AS metadata
     FROM support_reports
     WHERE reporter_id = $1
     ORDER BY created_at DESC`,
    [reporterId]
  );
  return rows.map((r) => mapReportFromRow(r));
}

export async function insertReport(report: ApiSupportReport): Promise<void> {
  await ensureUser(report.reporterId);
  const metadata = {
    reporterEmail: report.reporterEmail,
    reporterPhone: report.reporterPhone,
    reportedUserName: report.reportedUserName,
    messages: report.messages ?? [],
    aiSummary: report.aiSummary,
    aiSuggestedReply: report.aiSuggestedReply,
    unreadByAdmin: report.unreadByAdmin ?? true,
    unreadByReporter: report.unreadByReporter ?? false,
    aiPowered: report.aiPowered ?? false,
    updatedAt: report.updatedAt ?? report.createdAt,
  };
  await query(
    `INSERT INTO support_reports (
      id, reporter_id, reporter_name, category, urgency, status, comment,
      listing_id, listing_title, chat_id, reported_user_id, chat_preview, created_at, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      metadata = EXCLUDED.metadata`,
    [
      report.id,
      report.reporterId,
      report.reporterName,
      report.category,
      report.urgency,
      report.status,
      report.comment,
      report.listingId ?? null,
      report.listingTitle ?? null,
      report.chatId ?? null,
      report.reportedUserId ?? null,
      report.chatPreview ?? null,
      report.createdAt,
      JSON.stringify(metadata),
    ]
  );
}

export async function upsertReport(report: ApiSupportReport): Promise<void> {
  await insertReport(report);
}

export async function updateReportStatus(
  id: string,
  status: string
): Promise<boolean> {
  const res = await pool.query(
    "UPDATE support_reports SET status = $1 WHERE id = $2",
    [status, id]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getAdminUserIds(): Promise<string[]> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@vauto.com").trim();
  const rows = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE role IN ('admin', 'super_admin')
        OR lower(email) = lower($1)`,
    [adminEmail]
  );
  const ids = new Set(rows.map((r) => r.id));
  ids.add("admin-1");
  return [...ids];
}

export {
  getPlatformSetting,
  setPlatformSetting,
  getPlatformFlags,
  setPlatformFlags,
} from "./platform/platform-settings.js";
export type { PlatformFlags } from "./platform/platform-settings.js";

export async function getAdminNotifyEmails(): Promise<string[]> {
  const rows = await query<{ email: string | null }>(
    `SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL AND email <> ''`
  );
  const fromDb = rows.map((r) => r.email!.trim()).filter(Boolean);
  const fromEnv =
    process.env.ADMIN_NOTIFY_EMAIL?.split(",")
      .map((e) => e.trim())
      .filter(Boolean) ?? [];
  const fallback = process.env.ADMIN_EMAIL?.trim()
    ? [process.env.ADMIN_EMAIL.trim()]
    : ["admin@vauto.com"];
  return [...new Set([...fromEnv, ...fromDb, ...fallback])];
}

export async function getBannedUserIds(): Promise<string[]> {
  const rows = await query<{ user_id: string }>(
    "SELECT user_id FROM banned_users"
  );
  return rows.map((r) => r.user_id);
}

export async function setBannedUserIds(ids: string[]): Promise<void> {
  await pool.query("DELETE FROM banned_users");
  for (const userId of ids) {
    await ensureUser(userId);
    await query(
      "INSERT INTO banned_users (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [userId]
    );
  }
}

export async function warnUser(userId: string): Promise<void> {
  await ensureUser(userId);
  await query("UPDATE users SET warned = true WHERE id = $1", [userId]);
}

export async function getEscrowForThread(
  threadId: string
): Promise<ApiEscrowTransaction | null> {
  const rows = await query<{
    id: string;
    thread_id: string;
    listing_id: string;
    buyer_id: string;
    seller_id: string;
    amount: string;
    status: string;
    tracking_code: string | null;
    buyer_protection_fee: string | null;
    buyer_total: string | null;
    stripe_payment_intent_id: string | null;
    shipping_label_id: string | null;
    delivery_status: string | null;
    buyer_confirmed: boolean | null;
    shipping_provider: string | null;
    shipping_locker_id: string | null;
    shipping_locker_name: string | null;
    express_escrow_24h: boolean | null;
    delivered_to_locker_at: Date | null;
    claim_deadline_at: Date | null;
    courier_status: string | null;
    courier_provider: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, thread_id, listing_id, buyer_id, seller_id, amount, status,
            tracking_code, buyer_protection_fee, buyer_total, stripe_payment_intent_id,
            shipping_label_id, delivery_status, buyer_confirmed, shipping_provider,
            shipping_locker_id, shipping_locker_name, express_escrow_24h,
            delivered_to_locker_at, claim_deadline_at, courier_status, courier_provider,
            created_at, updated_at
     FROM escrow_transactions WHERE thread_id = $1`,
    [threadId]
  );
  const r = rows[0];
  if (!r) return null;
  return mapEscrowRow(r);
}

function mapEscrowRow(r: {
  id: string;
  thread_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: string;
  status: string;
  tracking_code: string | null;
  buyer_protection_fee: string | null;
  buyer_total: string | null;
  stripe_payment_intent_id: string | null;
  shipping_label_id: string | null;
  delivery_status: string | null;
  buyer_confirmed: boolean | null;
  shipping_provider: string | null;
  shipping_locker_id: string | null;
  shipping_locker_name: string | null;
  express_escrow_24h: boolean | null;
  delivered_to_locker_at: Date | null;
  claim_deadline_at: Date | null;
  courier_status: string | null;
  courier_provider: string | null;
  created_at: Date;
  updated_at: Date;
}): ApiEscrowTransaction {
  return {
    id: r.id,
    threadId: r.thread_id,
    listingId: r.listing_id,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    amount: Number(r.amount),
    status: r.status as ApiEscrowTransaction["status"],
    trackingCode: r.tracking_code ?? undefined,
    buyerProtectionFee:
      r.buyer_protection_fee != null ? Number(r.buyer_protection_fee) : undefined,
    buyerTotal: r.buyer_total != null ? Number(r.buyer_total) : undefined,
    stripePaymentIntentId: r.stripe_payment_intent_id ?? undefined,
    shippingLabelId: r.shipping_label_id ?? undefined,
    deliveryStatus: r.delivery_status ?? undefined,
    buyerConfirmed: r.buyer_confirmed ?? undefined,
    shippingProvider: r.shipping_provider ?? undefined,
    shippingLockerId: r.shipping_locker_id ?? undefined,
    shippingLockerName: r.shipping_locker_name ?? undefined,
    expressEscrow24h: r.express_escrow_24h ?? undefined,
    deliveredToLockerAt: r.delivered_to_locker_at?.toISOString(),
    claimDeadlineAt: r.claim_deadline_at?.toISOString(),
    courierStatus: r.courier_status ?? undefined,
    courierProvider: r.courier_provider ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function getEscrowById(
  escrowId: string
): Promise<ApiEscrowTransaction | null> {
  const rows = await query<Parameters<typeof mapEscrowRow>[0]>(
    `SELECT id, thread_id, listing_id, buyer_id, seller_id, amount, status,
            tracking_code, buyer_protection_fee, buyer_total, stripe_payment_intent_id,
            shipping_label_id, delivery_status, buyer_confirmed, shipping_provider,
            shipping_locker_id, shipping_locker_name, express_escrow_24h,
            delivered_to_locker_at, claim_deadline_at, courier_status, courier_provider,
            created_at, updated_at
     FROM escrow_transactions WHERE id = $1`,
    [escrowId]
  );
  const r = rows[0];
  return r ? mapEscrowRow(r) : null;
}

export async function getUserStripeConnectAccountId(
  userId: string
): Promise<string | null> {
  const rows = await query<{ stripe_connect_account_id: string | null }>(
    `SELECT stripe_connect_account_id FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0]?.stripe_connect_account_id ?? null;
}

export async function upsertEscrow(escrow: ApiEscrowTransaction): Promise<void> {
  await ensureUser(escrow.buyerId);
  await ensureUser(escrow.sellerId);
  await query(
    `INSERT INTO escrow_transactions (
      id, thread_id, listing_id, buyer_id, seller_id, amount, status,
      tracking_code, buyer_protection_fee, buyer_total, stripe_payment_intent_id,
      shipping_label_id, delivery_status, buyer_confirmed, shipping_provider,
      shipping_locker_id, shipping_locker_name, express_escrow_24h,
      delivered_to_locker_at, claim_deadline_at, courier_status, courier_provider,
      created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      tracking_code = EXCLUDED.tracking_code,
      buyer_protection_fee = EXCLUDED.buyer_protection_fee,
      buyer_total = EXCLUDED.buyer_total,
      stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
      shipping_label_id = EXCLUDED.shipping_label_id,
      delivery_status = EXCLUDED.delivery_status,
      buyer_confirmed = EXCLUDED.buyer_confirmed,
      shipping_provider = EXCLUDED.shipping_provider,
      shipping_locker_id = EXCLUDED.shipping_locker_id,
      shipping_locker_name = EXCLUDED.shipping_locker_name,
      express_escrow_24h = EXCLUDED.express_escrow_24h,
      delivered_to_locker_at = EXCLUDED.delivered_to_locker_at,
      claim_deadline_at = EXCLUDED.claim_deadline_at,
      courier_status = EXCLUDED.courier_status,
      courier_provider = EXCLUDED.courier_provider,
      updated_at = EXCLUDED.updated_at`,
    [
      escrow.id,
      escrow.threadId,
      escrow.listingId,
      escrow.buyerId,
      escrow.sellerId,
      escrow.amount,
      escrow.status,
      escrow.trackingCode ?? null,
      escrow.buyerProtectionFee ?? null,
      escrow.buyerTotal ?? null,
      escrow.stripePaymentIntentId ?? null,
      escrow.shippingLabelId ?? null,
      escrow.deliveryStatus ?? "pending",
      escrow.buyerConfirmed ?? false,
      escrow.shippingProvider ?? null,
      escrow.shippingLockerId ?? null,
      escrow.shippingLockerName ?? null,
      escrow.expressEscrow24h ?? false,
      escrow.deliveredToLockerAt ?? null,
      escrow.claimDeadlineAt ?? null,
      escrow.courierStatus ?? null,
      escrow.courierProvider ?? null,
      escrow.createdAt,
      escrow.updatedAt,
    ]
  );
}

export async function markEscrowPaidFromStripe(opts: {
  escrowId: string;
  paymentIntentId: string;
  buyerProtectionFee: number;
  buyerTotal: number;
}): Promise<ApiEscrowTransaction | null> {
  const now = new Date().toISOString();
  await query(
    `UPDATE escrow_transactions SET
      status = 'paid',
      stripe_payment_intent_id = $2,
      buyer_protection_fee = $3,
      buyer_total = $4,
      delivery_status = 'awaiting_shipment',
      updated_at = $5
     WHERE id = $1`,
    [opts.escrowId, opts.paymentIntentId, opts.buyerProtectionFee, opts.buyerTotal, now]
  );
  return getEscrowById(opts.escrowId);
}

export async function confirmEscrowDelivery(
  escrowId: string
): Promise<ApiEscrowTransaction | null> {
  const now = new Date().toISOString();
  await query(
    `UPDATE escrow_transactions SET
      status = 'completed',
      buyer_confirmed = true,
      delivery_status = 'delivered_confirmed',
      updated_at = $2
     WHERE id = $1`,
    [escrowId, now]
  );
  return getEscrowById(escrowId);
}

export async function getChats(userId: string): Promise<ApiChatThread[]> {
  const threads = await query<{
    id: string;
    listing_id: string;
    listing_title: string;
    buyer_id: string;
    seller_id: string;
    escrow_offered: boolean;
    last_read_at: Date | null;
    sms_fallback_sent_for: string | null;
  }>(
    `SELECT id, listing_id, listing_title, buyer_id, seller_id, escrow_offered,
            last_read_at, sms_fallback_sent_for
     FROM chat_threads
     WHERE buyer_id = $1 OR seller_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );

  const result: ApiChatThread[] = [];
  for (const t of threads) {
    const messages = await query<{
      id: string;
      sender_id: string;
      body: string;
      created_at: Date;
      read_at: Date | null;
    }>(
      `SELECT id, sender_id, body, created_at, read_at FROM chat_messages
       WHERE thread_id = $1 ORDER BY created_at ASC`,
      [t.id]
    );
    result.push({
      id: t.id,
      listingId: t.listing_id,
      listingTitle: t.listing_title,
      buyerId: t.buyer_id,
      sellerId: t.seller_id,
      escrowOffered: t.escrow_offered,
      lastReadAt: t.last_read_at?.toISOString(),
      smsFallbackSentFor: t.sms_fallback_sent_for ?? undefined,
      escrow: await getEscrowForThread(t.id),
      messages: messages.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        text: m.body,
        timestamp: m.created_at.toISOString(),
        readAt: m.read_at?.toISOString(),
      })),
    });
  }
  return result;
}

export interface ChatThreadMeta {
  id: string;
  buyerId: string;
  sellerId: string;
  listingTitle: string;
  escrowOffered: boolean;
  messageCount: number;
  buyerMessageCount: number;
}

export async function getChatThreadMeta(
  threadId: string
): Promise<ChatThreadMeta | null> {
  const rows = await query<{
    id: string;
    buyer_id: string;
    seller_id: string;
    listing_title: string;
    escrow_offered: boolean;
    message_count: string;
    buyer_message_count: string;
  }>(
    `SELECT t.id, t.buyer_id, t.seller_id, t.listing_title, t.escrow_offered,
            COUNT(m.id)::text AS message_count,
            COUNT(m.id) FILTER (WHERE m.sender_id = t.buyer_id)::text AS buyer_message_count
     FROM chat_threads t
     LEFT JOIN chat_messages m ON m.thread_id = t.id
     WHERE t.id = $1
     GROUP BY t.id`,
    [threadId]
  );
  const t = rows[0];
  if (!t) return null;
  return {
    id: t.id,
    buyerId: t.buyer_id,
    sellerId: t.seller_id,
    listingTitle: t.listing_title,
    escrowOffered: t.escrow_offered,
    messageCount: Number(t.message_count) || 0,
    buyerMessageCount: Number(t.buyer_message_count) || 0,
  };
}

/** Mark that SMS fallback was sent for this message (idempotent per messageId). */
export async function markChatSmsFallbackSent(
  chatId: string,
  messageId: string
): Promise<void> {
  await query(
    `UPDATE chat_threads
     SET sms_fallback_sent_for = $2, updated_at = now()
     WHERE id = $1`,
    [chatId, messageId]
  );
}

/**
 * True when SMS fallback should still fire for this message:
 * - thread exists and recipient is a participant
 * - sms_fallback_sent_for is not already this messageId
 * - message exists, was not sent by recipient, and is still unread
 * - recipient last_read_at is missing or before the message timestamp
 */
export async function shouldSendChatSmsFallback(
  chatId: string,
  recipientId: string,
  messageId: string,
  messageCreatedAt?: string
): Promise<boolean> {
  const threads = await query<{
    sms_fallback_sent_for: string | null;
    last_read_at: Date | null;
    buyer_id: string;
    seller_id: string;
  }>(
    `SELECT sms_fallback_sent_for, last_read_at, buyer_id, seller_id
     FROM chat_threads WHERE id = $1`,
    [chatId]
  );
  const thread = threads[0];
  if (!thread) return false;
  if (thread.sms_fallback_sent_for === messageId) return false;
  if (recipientId !== thread.buyer_id && recipientId !== thread.seller_id) {
    return false;
  }

  const messages = await query<{
    id: string;
    sender_id: string;
    created_at: Date;
    read_at: Date | null;
  }>(
    `SELECT id, sender_id, created_at, read_at
     FROM chat_messages WHERE thread_id = $1 AND id = $2`,
    [chatId, messageId]
  );
  const msg = messages[0];
  if (!msg) return false;
  if (msg.sender_id === recipientId) return false;
  if (msg.read_at) return false;

  const createdAt = messageCreatedAt
    ? new Date(messageCreatedAt)
    : msg.created_at;
  if (Number.isNaN(createdAt.getTime())) return false;
  if (thread.last_read_at && thread.last_read_at.getTime() >= createdAt.getTime()) {
    return false;
  }

  return true;
}

/** Resolve canonical thread id for buyer+seller+listing (listing-bound chats). */
export async function findChatIdByListingParticipants(
  buyerId: string,
  sellerId: string,
  listingId: string
): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM chat_threads
     WHERE buyer_id = $1 AND seller_id = $2 AND listing_id = $3
     LIMIT 1`,
    [buyerId, sellerId, listingId]
  );
  return rows[0]?.id ?? null;
}

export async function upsertChat(thread: ApiChatThread): Promise<ApiChatThread> {
  await ensureUser(thread.buyerId);
  await ensureUser(thread.sellerId);

  const messages = (thread.messages ?? [])
    .map((m) => {
      let senderId = String(m.senderId ?? "").trim();
      // Never persist guest / empty sender — map to buyer (authenticated path).
      if (!senderId || senderId === "guest") {
        senderId = String(thread.buyerId ?? "").trim();
      }
      return { ...m, senderId };
    })
    .filter((m) => Boolean(m.senderId) && m.senderId !== "guest");

  const senderIds = new Set<string>();
  for (const m of messages) senderIds.add(m.senderId);
  for (const senderId of senderIds) {
    await ensureUser(senderId);
  }

  // Prefer existing listing-bound thread; never reuse another listing's id.
  // Always fall back to the canonical id — never client-suffixed variants —
  // so parallel PUTs collide on the same primary key + unique triple.
  const canonicalListingId = buildListingBoundChatId(
    thread.buyerId,
    thread.sellerId,
    thread.listingId
  );
  let preferredId =
    (await findChatIdByListingParticipants(
      thread.buyerId,
      thread.sellerId,
      thread.listingId
    )) ?? canonicalListingId;

  if (preferredId === thread.id || preferredId === canonicalListingId) {
    const existingById = await query<{
      listing_id: string;
      buyer_id: string;
      seller_id: string;
    }>(
      `SELECT listing_id, buyer_id, seller_id FROM chat_threads WHERE id = $1`,
      [preferredId]
    );
    const row = existingById[0];
    if (
      row &&
      (row.listing_id !== thread.listingId ||
        row.buyer_id !== thread.buyerId ||
        row.seller_id !== thread.sellerId)
    ) {
      preferredId = canonicalListingId;
    }
  } else {
    preferredId = preferredId || canonicalListingId;
  }

  const threadParams = [
    preferredId,
    thread.listingId,
    thread.listingTitle,
    thread.buyerId,
    thread.sellerId,
    thread.escrowOffered,
    thread.lastReadAt ?? null,
    thread.smsFallbackSentFor ?? null,
  ];

  const isMissingListingUnique = (err: unknown): boolean => {
    const e = err as { code?: string; message?: string };
    const msg = String(e?.message ?? err ?? "");
    // Never fail-open on real unique violations — that creates duplicate threads.
    if (e?.code === "23505") return false;
    // Only when the 034 unique index is absent (ON CONFLICT target invalid).
    return (
      e?.code === "42P10" ||
      /there is no unique or exclusion constraint matching the ON CONFLICT specification/i.test(
        msg
      )
    );
  };

  // Serialize the whole upsert (thread row + messages) per listing-bound triple.
  const lockKey = `chat:${thread.buyerId}:${thread.sellerId}:${thread.listingId}`;
  await pool.query("SELECT pg_advisory_lock(hashtext($1::text))", [lockKey]);
  try {
    // Re-resolve under lock to collapse races that found null before insert.
    preferredId =
      (await findChatIdByListingParticipants(
        thread.buyerId,
        thread.sellerId,
        thread.listingId
      )) ?? canonicalListingId;
    threadParams[0] = preferredId;

    let inserted: { id: string }[];
    try {
      inserted = await query<{ id: string }>(
        `INSERT INTO chat_threads (
          id, listing_id, listing_title, buyer_id, seller_id, escrow_offered,
          last_read_at, sms_fallback_sent_for, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
         ON CONFLICT (buyer_id, seller_id, listing_id) DO UPDATE SET
           listing_title = EXCLUDED.listing_title,
           escrow_offered = EXCLUDED.escrow_offered,
           last_read_at = EXCLUDED.last_read_at,
           sms_fallback_sent_for = COALESCE(
             EXCLUDED.sms_fallback_sent_for,
             chat_threads.sms_fallback_sent_for
           ),
           updated_at = now()
         RETURNING id`,
        threadParams
      );
    } catch (err) {
      if (!isMissingListingUnique(err)) throw err;
      // Fail-open only when migration 034 unique index is not applied yet.
      inserted = await query<{ id: string }>(
        `INSERT INTO chat_threads (
          id, listing_id, listing_title, buyer_id, seller_id, escrow_offered,
          last_read_at, sms_fallback_sent_for, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
         ON CONFLICT (id) DO UPDATE SET
           listing_title = EXCLUDED.listing_title,
           escrow_offered = EXCLUDED.escrow_offered,
           last_read_at = EXCLUDED.last_read_at,
           sms_fallback_sent_for = COALESCE(
             EXCLUDED.sms_fallback_sent_for,
             chat_threads.sms_fallback_sent_for
           ),
           updated_at = now()
         RETURNING id`,
        threadParams
      );
    }

    const canonicalId = inserted[0]?.id ?? preferredId;
    const outbound: ApiChatThread = { ...thread, id: canonicalId };

    await pool.query("DELETE FROM chat_messages WHERE thread_id = $1", [
      outbound.id,
    ]);
    for (const m of messages) {
      await query(
        `INSERT INTO chat_messages (id, thread_id, sender_id, body, created_at, read_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           thread_id = EXCLUDED.thread_id,
           sender_id = EXCLUDED.sender_id,
           body = EXCLUDED.body,
           created_at = EXCLUDED.created_at,
           read_at = EXCLUDED.read_at`,
        [
          m.id,
          outbound.id,
          m.senderId,
          m.text,
          m.timestamp,
          m.readAt ?? null,
        ]
      );
    }
    return outbound;
  } finally {
    await pool.query("SELECT pg_advisory_unlock(hashtext($1::text))", [lockKey]);
  }
}

export async function getReviews(): Promise<ApiReview[]> {
  const rows = await query<{
    id: string;
    seller_id: string;
    listing_id: string;
    listing_title: string;
    reviewer_id: string;
    reviewer_name: string;
    rating: number;
    comment: string | null;
    tags: unknown;
    created_at: Date;
  }>(
    `SELECT id, seller_id, listing_id, listing_title, reviewer_id, reviewer_name,
            rating, comment, COALESCE(tags, '[]'::jsonb) AS tags, created_at
     FROM seller_reviews ORDER BY created_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    sellerId: r.seller_id,
    listingId: r.listing_id,
    listingTitle: r.listing_title,
    reviewerId: r.reviewer_id,
    reviewerName: r.reviewer_name,
    rating: r.rating,
    comment: r.comment ?? undefined,
    tags: Array.isArray(r.tags)
      ? r.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function insertReview(review: ApiReview): Promise<void> {
  await ensureUser(review.reviewerId);
  await ensureUser(review.sellerId);
  const tags = Array.isArray(review.tags)
    ? review.tags.filter((t) => typeof t === "string").slice(0, 8)
    : [];
  await query(
    `INSERT INTO seller_reviews (
      id, seller_id, listing_id, listing_title, reviewer_id, reviewer_name, rating, comment, tags, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      review.id,
      review.sellerId,
      review.listingId,
      review.listingTitle,
      review.reviewerId,
      review.reviewerName,
      review.rating,
      review.comment ?? null,
      JSON.stringify(tags),
      review.createdAt,
    ]
  );
}

/** Grant 1 free TOP listing boost after a submitted review (gamification). */
export async function grantFreeTopBoostCredit(
  userId: string
): Promise<{ freeTopBoostCredits: number } | null> {
  await ensureUser(userId);
  const rows = await query<{ free_top_boost_credits: number }>(
    `UPDATE users
     SET free_top_boost_credits = COALESCE(free_top_boost_credits, 0) + 1,
         updated_at = now()
     WHERE id = $1
     RETURNING free_top_boost_credits`,
    [userId]
  );
  if (!rows[0]) return null;
  const txId = `wtx-reward-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await query(
    `INSERT INTO wallet_transactions (id, user_id, amount, kind)
     VALUES ($1, $2, 0, 'review_reward')`,
    [txId, userId]
  ).catch(() => undefined);
  return { freeTopBoostCredits: Number(rows[0].free_top_boost_credits) };
}

export async function consumeFreeTopBoostCredit(
  userId: string
): Promise<boolean> {
  const rows = await query<{ free_top_boost_credits: number }>(
    `UPDATE users
     SET free_top_boost_credits = free_top_boost_credits - 1,
         updated_at = now()
     WHERE id = $1 AND COALESCE(free_top_boost_credits, 0) >= 1
     RETURNING free_top_boost_credits`,
    [userId]
  );
  if (!rows[0]) return false;
  const txId = `wtx-boost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await query(
    `INSERT INTO wallet_transactions (id, user_id, amount, kind)
     VALUES ($1, $2, 0, 'free_boost')`,
    [txId, userId]
  ).catch(() => undefined);
  return true;
}

export async function topUpWallet(
  userId: string,
  amount: number
): Promise<{ walletBalance: number } | null> {
  if (amount <= 0 || amount > 500) return null;
  const txId = `wtx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rows = await query<{ wallet_balance: string }>(
    `UPDATE users SET wallet_balance = wallet_balance + $2, updated_at = now()
     WHERE id = $1 RETURNING wallet_balance`,
    [userId, amount]
  );
  if (!rows[0]) return null;
  await query(
    `INSERT INTO wallet_transactions (id, user_id, amount, kind) VALUES ($1, $2, $3, 'top_up')`,
    [txId, userId, amount]
  );
  return { walletBalance: Number(rows[0].wallet_balance) };
}

/** Admin Control Center credit — recorded as refund for audit trail. */
export async function adminCreditWallet(
  userId: string,
  amount: number
): Promise<{ walletBalance: number; transactionId: string } | null> {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 2000) return null;
  const rounded = Math.round(amount * 100) / 100;
  const txId = `wtx-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rows = await query<{ wallet_balance: string }>(
    `UPDATE users SET wallet_balance = wallet_balance + $2, updated_at = now()
     WHERE id = $1 RETURNING wallet_balance`,
    [userId, rounded]
  );
  if (!rows[0]) return null;
  try {
    await query(
      `INSERT INTO wallet_transactions (id, user_id, amount, kind)
       VALUES ($1, $2, $3, 'refund')`,
      [txId, userId, rounded]
    );
  } catch {
    await query(
      `INSERT INTO wallet_transactions (id, user_id, amount, kind)
       VALUES ($1, $2, $3, 'top_up')`,
      [txId, userId, rounded]
    );
  }
  return {
    walletBalance: Number(rows[0].wallet_balance),
    transactionId: txId,
  };
}

/**
 * Apply paid promote / boost on a listing (Stripe or wallet).
 * Sets promoted=true, visibility attrs + expiry, bumps created_at for feed rank.
 */
export async function applyListingPromotePaid(opts: {
  userId: string;
  listingId: string;
  tier?: number;
  durationDays?: number;
  stripeSessionId?: string;
}): Promise<ApiListing | null> {
  const tier = Math.min(5, Math.max(1, Math.floor(opts.tier ?? 2)));
  const { promoteDurationDays } = await import("./billing/promote-pricing.js");
  const durationDays =
    opts.durationDays ??
    promoteDurationDays(tier as 1 | 2 | 3 | 4 | 5);
  const expires = new Date();
  expires.setDate(expires.getDate() + durationDays);

  const existing = await query<{ attributes: Record<string, unknown> | null }>(
    `SELECT attributes FROM listings WHERE id = $1 AND seller_id = $2`,
    [opts.listingId, opts.userId]
  );
  if (!existing[0]) return null;

  const attrs = {
    ...(existing[0].attributes ?? {}),
    _visibilityTier: String(tier),
    _visibilityExpiresAt: expires.toISOString(),
    ...(opts.stripeSessionId
      ? { _promoteStripeSessionId: opts.stripeSessionId }
      : {}),
  };

  const listRows = await query<ListingRow>(
    `UPDATE listings
     SET promoted = true,
         attributes = $3::jsonb,
         created_at = now()
     WHERE id = $1 AND seller_id = $2
     RETURNING id, seller_id, title, price, price_label, location, distance_km,
       latitude, longitude, slug, image, category, tags, contact, has_video, created_at,
       expires_at, description, attributes, status, banned, vin_verified, provider_verified, promoted,
       min_negotiation_price, appraisal_score,
       is_verified, requires_review, image_alt, image_title,
       allow_pastomatas`,
    [opts.listingId, opts.userId, JSON.stringify(attrs)]
  );
  return listRows[0] ? mapListingRow(listRows[0]) : null;
}

export async function promoteListingWallet(
  userId: string,
  listingId: string,
  cost: number,
  tier = 2
): Promise<{ walletBalance: number; listing: ApiListing } | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const balRows = await client.query<{ wallet_balance: string }>(
      `UPDATE users SET wallet_balance = wallet_balance - $3, updated_at = now()
       WHERE id = $1 AND wallet_balance >= $3
       RETURNING wallet_balance`,
      [userId, listingId, cost]
    );
    if (!balRows.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const existing = await client.query<{ attributes: Record<string, unknown> | null }>(
      `SELECT attributes FROM listings WHERE id = $1 AND seller_id = $2`,
      [listingId, userId]
    );
    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const { promoteDurationDays } = await import("./billing/promote-pricing.js");
    const safeTier = Math.min(5, Math.max(1, Math.floor(tier))) as 1 | 2 | 3 | 4 | 5;
    const durationDays = promoteDurationDays(safeTier);
    const expires = new Date();
    expires.setDate(expires.getDate() + durationDays);
    const attrs = {
      ...(existing.rows[0].attributes ?? {}),
      _visibilityTier: String(safeTier),
      _visibilityExpiresAt: expires.toISOString(),
    };
    const listRows = await client.query<ListingRow>(
      `UPDATE listings
       SET promoted = true,
           attributes = $3::jsonb,
           created_at = now()
       WHERE id = $1 AND seller_id = $2
       RETURNING id, seller_id, title, price, price_label, location, distance_km,
         latitude, longitude, slug, image, category, tags, contact, has_video, created_at,
         expires_at, description, attributes, status, banned, vin_verified, provider_verified, promoted,
         min_negotiation_price, appraisal_score,
         is_verified, requires_review, image_alt, image_title,
         allow_pastomatas`,
      [listingId, userId, JSON.stringify(attrs)]
    );
    if (!listRows.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const txId = `wtx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, amount, kind, listing_id)
       VALUES ($1, $2, $3, 'promote', $4)`,
      [txId, userId, -cost, listingId]
    );
    await client.query("COMMIT");
    return {
      walletBalance: Number(balRows.rows[0].wallet_balance),
      listing: mapListingRow(listRows.rows[0]),
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function upsertPushSubscription(
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string }
): Promise<void> {
  const id = `psub-${Buffer.from(sub.endpoint).toString("base64url").slice(0, 40)}`;
  await ensureUser(userId);
  await query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth_key)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET
       p256dh = EXCLUDED.p256dh,
       auth_key = EXCLUDED.auth_key`,
    [id, userId, sub.endpoint, sub.p256dh, sub.auth]
  );
}

export async function deletePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  await query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint]
  );
}

export async function getPushSubscriptionsForUsers(
  userIds: string[]
): Promise<
  { userId: string; endpoint: string; p256dh: string; auth: string }[]
> {
  if (!userIds.length) return [];
  const rows = await query<{
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth_key: string;
  }>(
    `SELECT user_id, endpoint, p256dh, auth_key FROM push_subscriptions
     WHERE user_id = ANY($1::text[])`,
    [userIds]
  );
  return rows.map((r) => ({
    userId: r.user_id,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth_key,
  }));
}

export async function upsertUserPushToken(
  userId: string,
  token: string,
  deviceType = "android"
): Promise<void> {
  await ensureUser(userId);
  await query(
    `INSERT INTO user_push_tokens (user_id, token, device_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, token) DO UPDATE SET
       device_type = EXCLUDED.device_type`,
    [userId, token, deviceType]
  );
}

export async function upsertFcmToken(
  userId: string,
  token: string,
  platform = "android"
): Promise<void> {
  await upsertUserPushToken(userId, token, platform);
  const id = `fcm-${Buffer.from(token).toString("base64url").slice(0, 40)}`;
  await query(
    `INSERT INTO fcm_tokens (id, user_id, token, platform, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, token) DO UPDATE SET
       platform = EXCLUDED.platform,
       updated_at = now()`,
    [id, userId, token, platform]
  );
}

export async function deleteFcmToken(userId: string, token: string): Promise<void> {
  await query(`DELETE FROM user_push_tokens WHERE user_id = $1 AND token = $2`, [
    userId,
    token,
  ]);
  await query(`DELETE FROM fcm_tokens WHERE user_id = $1 AND token = $2`, [
    userId,
    token,
  ]);
}

export async function getUserPushTokensForUsers(
  userIds: string[]
): Promise<{ userId: string; token: string }[]> {
  if (!userIds.length) return [];
  const rows = await query<{ user_id: string; token: string }>(
    `SELECT DISTINCT user_id, token FROM (
       SELECT user_id, token FROM user_push_tokens WHERE user_id = ANY($1::text[])
       UNION
       SELECT user_id, token FROM fcm_tokens WHERE user_id = ANY($1::text[])
     ) AS tokens`,
    [userIds]
  );
  return rows.map((r) => ({ userId: r.user_id, token: r.token }));
}

export async function getFcmTokensForUsers(
  userIds: string[]
): Promise<{ userId: string; token: string }[]> {
  return getUserPushTokensForUsers(userIds);
}

export async function setUserAlertQueries(
  userId: string,
  queries: string[]
): Promise<void> {
  await ensureUser(userId);
  await pool.query("DELETE FROM user_alert_queries WHERE user_id = $1", [userId]);
  for (const q of queries.filter((x) => x.trim().length >= 3)) {
    await query(
      `INSERT INTO user_alert_queries (user_id, query) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, q.trim()]
    );
  }
}

export async function getUserAlertQueries(userId: string): Promise<string[]> {
  const rows = await query<{ query: string }>(
    `SELECT query FROM user_alert_queries WHERE user_id = $1 ORDER BY query`,
    [userId]
  );
  return rows.map((r) => r.query);
}

export async function appendUserAlertQuery(userId: string, alertQuery: string): Promise<void> {
  const q = alertQuery.trim();
  if (q.length < 3) return;
  await ensureUser(userId);
  await query(
    `INSERT INTO user_alert_queries (user_id, query) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, q]
  );
}

export async function insertUserRequirement(
  userId: string,
  req: {
    query: string;
    category?: string;
    city?: string;
    maxPrice?: number;
    minPrice?: number;
    size?: string;
    subcategory?: string;
    wardrobeMode?: boolean;
    filters?: Record<string, unknown>;
    source?: string;
  }
): Promise<{ id: string } | null> {
  const q = req.query.trim();
  if (q.length < 3) return null;
  await ensureUser(userId);
  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await query(
    `INSERT INTO user_requirements (
       id, user_id, query, category, city, max_price, min_price,
       size, subcategory, wardrobe_mode, filters, source
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      userId,
      q,
      req.category ?? null,
      req.city ?? null,
      req.maxPrice ?? null,
      req.minPrice ?? null,
      req.size ?? null,
      req.subcategory ?? null,
      Boolean(req.wardrobeMode),
      req.filters ? JSON.stringify(req.filters) : null,
      req.source ?? "agent",
    ]
  );
  await appendUserAlertQuery(userId, q);
  return { id };
}

export async function getUsersMatchingListing(
  listing: ApiListing
): Promise<{ userId: string; query: string }[]> {
  const rows = await query<{ user_id: string; query: string }>(
    `SELECT user_id, query FROM user_alert_queries`
  );
  const tokens = (q: string) =>
    q
      .toLowerCase()
      .split(/[\s,.;:!?—–-]+/)
      .filter((t) => t.length >= 3);
  const haystack = [
    listing.title,
    listing.location,
    listing.category,
    ...listing.tags,
    listing.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return rows
    .filter((r) => {
      const t = tokens(r.query);
      return t.length > 0 && t.every((tok) => haystack.includes(tok));
    })
    .map((r) => ({ userId: r.user_id, query: r.query }));
}

export async function getActiveUserRequirements(): Promise<
  import("./offer-engine.js").UserRequirementRow[]
> {
  const rows = await query<{
    id: string;
    user_id: string;
    query: string;
    category: string | null;
    city: string | null;
    max_price: string | null;
    min_price: string | null;
    size: string | null;
    subcategory: string | null;
    wardrobe_mode: boolean;
    last_notified_listing_id: string | null;
  }>(
    `SELECT id, user_id, query, category, city, max_price, min_price,
            size, subcategory, wardrobe_mode, last_notified_listing_id
     FROM user_requirements
     WHERE status = 'active'`
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    query: r.query,
    category: r.category,
    city: r.city,
    maxPrice: r.max_price != null ? Number(r.max_price) : null,
    minPrice: r.min_price != null ? Number(r.min_price) : null,
    size: r.size,
    subcategory: r.subcategory,
    wardrobeMode: r.wardrobe_mode,
    lastNotifiedListingId: r.last_notified_listing_id,
  }));
}

export async function markRequirementNotified(
  requirementId: string,
  listingId: string
): Promise<void> {
  await query(
    `UPDATE user_requirements SET last_notified_listing_id = $2 WHERE id = $1`,
    [requirementId, listingId]
  );
}

export async function insertUserNotification(input: {
  userId: string;
  kind: string;
  title: string;
  body: string;
  url?: string;
}): Promise<{ id: string }> {
  const id = `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await query(
    `INSERT INTO user_notifications (id, user_id, kind, title, body, url)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.userId, input.kind, input.title, input.body, input.url ?? null]
  );
  return { id };
}

export async function getUserNotifications(
  userId: string,
  limit = 30
): Promise<
  {
    id: string;
    kind: string;
    title: string;
    body: string;
    url?: string;
    readAt?: string;
    createdAt: string;
  }[]
> {
  const rows = await query<{
    id: string;
    kind: string;
    title: string;
    body: string;
    url: string | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, kind, title, body, url, read_at, created_at
     FROM user_notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    url: r.url ?? undefined,
    readAt: r.read_at?.toISOString(),
    createdAt: r.created_at.toISOString(),
  }));
}

export async function markUserNotificationRead(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE user_notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [notificationId, userId]
  );
  return rows.length > 0;
}

export async function markAllUserNotificationsRead(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE user_notifications
     SET read_at = now()
     WHERE user_id = $1 AND read_at IS NULL
     RETURNING id`,
    [userId]
  );
  return rows.length;
}

export async function getListingForEmbedding(
  id: string
): Promise<ApiListing | null> {
  const rows = await query<ListingRow>(`${LISTING_SELECT} WHERE id = $1`, [id]);
  return rows[0] ? mapListingRow(rows[0]) : null;
}

/** Public catalog lookup by id or slug — for OG edge / social crawlers. */
export async function getPublicListingByIdOrSlug(
  idOrSlug: string
): Promise<ApiListing | null> {
  const key = idOrSlug.trim();
  if (!key) return null;
  try {
    const rows = await query<ListingRow>(
      `${LISTING_SELECT}
       WHERE ${PUBLIC_LISTING_VISIBILITY_SQL}
         AND (id::text = $1 OR slug = $1)
       LIMIT 1`,
      [key]
    );
    if (rows[0]) return mapListingRow(rows[0]);
  } catch {
    /* fall through to demo catalog */
  }
  if (isServerDemoCatalogEnabled()) {
    const demos = getDemoApiListings();
    return (
      demos.find((l) => l.id === key || l.slug === key) ?? null
    );
  }
  return null;
}

export async function updateListingEmbedding(
  id: string,
  embedding: number[]
): Promise<void> {
  await query(
    `UPDATE listings SET search_embedding = $2::jsonb, embedding_updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(embedding)]
  );
}

export async function searchListingsByEmbeddingRows(): Promise<
  { id: string; embedding: number[] }[]
> {
  const rows = await query<{ id: string; search_embedding: unknown }>(
    `SELECT id, search_embedding FROM listings
     WHERE NOT banned AND COALESCE(requires_review, false) = false AND COALESCE(status, 'active') = 'active'
       AND search_embedding IS NOT NULL`
  );
  return rows
    .filter((r) => Array.isArray(r.search_embedding))
    .map((r) => ({
      id: r.id,
      embedding: r.search_embedding as number[],
    }));
}

export async function listListingsMissingEmbeddings(
  limit: number
): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM listings
     WHERE NOT banned AND COALESCE(requires_review, false) = false AND COALESCE(status, 'active') = 'active'
       AND search_embedding IS NULL
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.id);
}

export async function updateListingImageEmbedding(
  id: string,
  embedding: number[]
): Promise<void> {
  await query(
    `UPDATE listings SET image_embedding = $2::jsonb, image_embedding_updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(embedding)]
  );
}

export async function searchListingsByImageEmbeddingRows(): Promise<
  { id: string; embedding: number[] }[]
> {
  const rows = await query<{ id: string; image_embedding: unknown }>(
    `SELECT id, image_embedding FROM listings
     WHERE NOT banned AND COALESCE(requires_review, false) = false AND COALESCE(status, 'active') = 'active'
       AND image_embedding IS NOT NULL`
  );
  return rows
    .filter((r) => Array.isArray(r.image_embedding))
    .map((r) => ({
      id: r.id,
      embedding: r.image_embedding as number[],
    }));
}

export async function syncImageEmbeddingsFromSearch(
  limit = 100
): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE listings
     SET image_embedding = search_embedding,
         image_embedding_updated_at = now()
     WHERE id IN (
       SELECT id FROM listings
       WHERE NOT banned AND COALESCE(status, 'active') = 'active'
         AND search_embedding IS NOT NULL
         AND image_embedding IS NULL
       ORDER BY created_at DESC
       LIMIT $1
     )
     RETURNING id`,
    [limit]
  );
  return rows.length;
}

export async function listListingsMissingImageEmbeddings(
  limit: number
): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM listings
     WHERE NOT banned AND COALESCE(status, 'active') = 'active'
       AND search_embedding IS NOT NULL
       AND image_embedding IS NULL
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.id);
}

export async function subscribeUserPlan(
  userId: string,
  planId: string,
  stripeSessionId?: string,
  stripeCustomerId?: string
): Promise<ApiUser | null> {
  if (stripeSessionId) {
    const existing = await query<{ user_id: string }>(
      `SELECT user_id FROM billing_subscriptions WHERE stripe_session_id = $1 LIMIT 1`,
      [stripeSessionId]
    );
    if (existing[0]) {
      if (stripeCustomerId) {
        await setUserStripeCustomerId(userId, stripeCustomerId);
      }
      return getUser(existing[0].user_id);
    }
  }

  const subId = `sub_${Date.now()}_${userId.slice(0, 8)}`;
  // Personal Starto akcija trial — only when promo is ON and this is a cardless/0€ activate
  // (no Stripe session). Paid Stripe checkouts keep expires_at null (ongoing).
  const expiresAt =
    !stripeSessionId && isLaunchPromoActive()
      ? computeLaunchPromoExpiresAt()
      : null;
  await ensureUser(userId);
  await query(
    `INSERT INTO billing_subscriptions (id, user_id, plan_id, status, stripe_session_id, expires_at)
     VALUES ($1, $2, $3, 'active', $4, $5)`,
    [subId, userId, planId, stripeSessionId ?? null, expiresAt]
  );
  if (planId === "pro" || planId === "enterprise" || planId === "starter") {
    await query(
      `UPDATE users SET billing_plan = $2, role = 'pro' WHERE id = $1`,
      [userId, planId]
    );
  } else {
    await query(`UPDATE users SET billing_plan = $2 WHERE id = $1`, [
      userId,
      planId,
    ]);
  }
  if (stripeCustomerId) {
    await setUserStripeCustomerId(userId, stripeCustomerId);
  }
  return getUser(userId);
}

export async function setUserStripeCustomerId(
  userId: string,
  customerId: string
): Promise<void> {
  await query(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1`, [
    userId,
    customerId,
  ]);
}

export async function getUserStripeCustomerId(
  userId: string
): Promise<string | null> {
  const rows = await query<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0]?.stripe_customer_id ?? null;
}

export async function cancelUserBillingByStripeCustomer(
  customerId: string
): Promise<void> {
  await query(
    `UPDATE billing_subscriptions SET status = 'canceled'
     WHERE user_id IN (SELECT id FROM users WHERE stripe_customer_id = $1)
       AND status = 'active'`,
    [customerId]
  );
  await query(
    `UPDATE users SET billing_plan = 'free'
     WHERE stripe_customer_id = $1`,
    [customerId]
  );
}

export interface BillingInvoiceRow {
  id: string;
  number: string;
  userId: string;
  stripeSessionId?: string;
  stripeInvoiceId?: string;
  kind: string;
  productId?: string;
  listingId?: string;
  serviceTitle: string;
  serviceDescription?: string;
  amountNet: number;
  vatRate: number;
  vatAmount: number;
  amountGross: number;
  buyerName?: string;
  buyerEmail?: string;
  buyerCompanyName?: string;
  buyerCompanyCode?: string;
  buyerVatCode?: string;
  paymentMethod?: string;
  createdAt: string;
}

async function nextBillingInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM billing_invoices
     WHERE EXTRACT(YEAR FROM created_at) = $1`,
    [year]
  );
  const seq = Number(rows[0]?.c ?? 0) + 1;
  return `VAUTO-${year}-${String(seq).padStart(4, "0")}`;
}

export async function insertBillingInvoice(input: {
  userId: string;
  stripeSessionId?: string;
  stripeInvoiceId?: string;
  kind: string;
  productId?: string;
  listingId?: string;
  serviceTitle: string;
  serviceDescription?: string;
  amountNet: number;
  vatRate: number;
  vatAmount: number;
  amountGross: number;
  buyerName?: string;
  buyerEmail?: string;
  buyerCompanyName?: string;
  buyerCompanyCode?: string;
  buyerVatCode?: string;
  paymentMethod?: string;
}): Promise<BillingInvoiceRow | null> {
  if (input.stripeSessionId) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM billing_invoices WHERE stripe_session_id = $1 LIMIT 1`,
      [input.stripeSessionId]
    );
    if (existing[0]) {
      return getBillingInvoiceById(existing[0].id);
    }
  }

  const id = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const number = await nextBillingInvoiceNumber();
  await ensureUser(input.userId);
  await query(
    `INSERT INTO billing_invoices (
      id, number, user_id, stripe_session_id, stripe_invoice_id, kind,
      product_id, listing_id, service_title, service_description,
      amount_net, vat_rate, vat_amount, amount_gross,
      buyer_name, buyer_email, buyer_company_name, buyer_company_code,
      buyer_vat_code, payment_method
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
    )`,
    [
      id,
      number,
      input.userId,
      input.stripeSessionId ?? null,
      input.stripeInvoiceId ?? null,
      input.kind,
      input.productId ?? null,
      input.listingId ?? null,
      input.serviceTitle,
      input.serviceDescription ?? null,
      input.amountNet,
      input.vatRate,
      input.vatAmount,
      input.amountGross,
      input.buyerName ?? null,
      input.buyerEmail ?? null,
      input.buyerCompanyName ?? null,
      input.buyerCompanyCode ?? null,
      input.buyerVatCode ?? null,
      input.paymentMethod ?? null,
    ]
  );
  return getBillingInvoiceById(id);
}

function mapBillingInvoiceRow(r: {
  id: string;
  number: string;
  user_id: string;
  stripe_session_id: string | null;
  stripe_invoice_id: string | null;
  kind: string;
  product_id: string | null;
  listing_id: string | null;
  service_title: string;
  service_description: string | null;
  amount_net: string | number;
  vat_rate: string | number;
  vat_amount: string | number;
  amount_gross: string | number;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_company_name: string | null;
  buyer_company_code: string | null;
  buyer_vat_code: string | null;
  payment_method: string | null;
  created_at: Date | string;
}): BillingInvoiceRow {
  return {
    id: r.id,
    number: r.number,
    userId: r.user_id,
    stripeSessionId: r.stripe_session_id ?? undefined,
    stripeInvoiceId: r.stripe_invoice_id ?? undefined,
    kind: r.kind,
    productId: r.product_id ?? undefined,
    listingId: r.listing_id ?? undefined,
    serviceTitle: r.service_title,
    serviceDescription: r.service_description ?? undefined,
    amountNet: Number(r.amount_net),
    vatRate: Number(r.vat_rate),
    vatAmount: Number(r.vat_amount),
    amountGross: Number(r.amount_gross),
    buyerName: r.buyer_name ?? undefined,
    buyerEmail: r.buyer_email ?? undefined,
    buyerCompanyName: r.buyer_company_name ?? undefined,
    buyerCompanyCode: r.buyer_company_code ?? undefined,
    buyerVatCode: r.buyer_vat_code ?? undefined,
    paymentMethod: r.payment_method ?? undefined,
    createdAt:
      typeof r.created_at === "string"
        ? r.created_at
        : r.created_at.toISOString(),
  };
}

export async function getBillingInvoiceById(
  id: string
): Promise<BillingInvoiceRow | null> {
  const rows = await query<{
    id: string;
    number: string;
    user_id: string;
    stripe_session_id: string | null;
    stripe_invoice_id: string | null;
    kind: string;
    product_id: string | null;
    listing_id: string | null;
    service_title: string;
    service_description: string | null;
    amount_net: string | number;
    vat_rate: string | number;
    vat_amount: string | number;
    amount_gross: string | number;
    buyer_name: string | null;
    buyer_email: string | null;
    buyer_company_name: string | null;
    buyer_company_code: string | null;
    buyer_vat_code: string | null;
    payment_method: string | null;
    created_at: Date | string;
  }>(`SELECT * FROM billing_invoices WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ? mapBillingInvoiceRow(rows[0]) : null;
}

export async function listBillingInvoicesForUser(
  userId: string
): Promise<BillingInvoiceRow[]> {
  const rows = await query<{
    id: string;
    number: string;
    user_id: string;
    stripe_session_id: string | null;
    stripe_invoice_id: string | null;
    kind: string;
    product_id: string | null;
    listing_id: string | null;
    service_title: string;
    service_description: string | null;
    amount_net: string | number;
    vat_rate: string | number;
    vat_amount: string | number;
    amount_gross: string | number;
    buyer_name: string | null;
    buyer_email: string | null;
    buyer_company_name: string | null;
    buyer_company_code: string | null;
    buyer_vat_code: string | null;
    payment_method: string | null;
    created_at: Date | string;
  }>(
    `SELECT * FROM billing_invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [userId]
  );
  return rows.map(mapBillingInvoiceRow);
}

export async function getEmbeddingIndexStats(): Promise<{
  activeListings: number;
  textIndexed: number;
  imageIndexed: number;
}> {
  const rows = await query<{
    active_listings: string;
    text_indexed: string;
    image_indexed: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE NOT banned AND COALESCE(status, 'active') = 'active')::text AS active_listings,
       COUNT(*) FILTER (WHERE search_embedding IS NOT NULL)::text AS text_indexed,
       COUNT(*) FILTER (WHERE image_embedding IS NOT NULL)::text AS image_indexed
     FROM listings`
  );
  const r = rows[0];
  return {
    activeListings: Number(r?.active_listings ?? 0),
    textIndexed: Number(r?.text_indexed ?? 0),
    imageIndexed: Number(r?.image_indexed ?? 0),
  };
}

type ServiceLeadRow = {
  id: string;
  source_user_id: string | null;
  title: string;
  city: string;
  category: string;
  summary: string;
  urgency: string;
  budget_hint: string;
  lead_price: string;
  hidden_contact: string;
  contact_phone: string;
  required_specialties: string[];
  query_text: string | null;
  created_at: Date;
  opened: boolean;
};

function mapServiceLeadRow(
  row: ServiceLeadRow,
  revealContact: boolean
): ApiServiceLead {
  return {
    id: row.id,
    title: row.title,
    city: row.city,
    category: row.category,
    summary: row.summary,
    urgency: row.urgency as ApiServiceUrgency,
    budgetHint: row.budget_hint,
    leadPrice: Number(row.lead_price),
    createdAt: row.created_at.toISOString(),
    hiddenContact: row.hidden_contact,
    contactPhone: revealContact ? row.contact_phone : undefined,
    requiredSpecialties: row.required_specialties ?? [],
    source: row.source_user_id ? "buyer" : "demo",
    sourceUserId: row.source_user_id ?? undefined,
    query: row.query_text ?? undefined,
    opened: row.opened,
  };
}

function serviceLeadMatchesProviderRow(
  lead: ServiceLeadRow,
  provider: {
    serviceBaseCity?: string;
    serviceNationwide?: boolean;
    serviceSpecialties?: string[];
  }
): boolean {
  if (!provider.serviceNationwide && provider.serviceBaseCity) {
    if (
      provider.serviceBaseCity.toLowerCase() !== lead.city.toLowerCase()
    ) {
      return false;
    }
  }
  const specialties = provider.serviceSpecialties ?? [];
  if (specialties.length === 0) return true;
  const required = lead.required_specialties ?? [];
  return required.some((req) =>
    specialties.some(
      (spec) =>
        spec.toLowerCase().includes(req.toLowerCase()) ||
        req.toLowerCase().includes(spec.toLowerCase())
    )
  );
}

export async function insertServiceLead(
  sourceUserId: string | undefined,
  lead: {
    title: string;
    city: string;
    category: string;
    summary: string;
    urgency: string;
    budgetHint: string;
    leadPrice: number;
    hiddenContact: string;
    contactPhone: string;
    requiredSpecialties: string[];
    query?: string;
  }
): Promise<ApiServiceLead | null> {
  if (lead.query && sourceUserId) {
    const dup = await query<{ id: string }>(
      `SELECT id FROM service_leads
       WHERE source_user_id = $1
         AND lower(query_text) = lower($2)
         AND created_at > now() - interval '1 hour'
       LIMIT 1`,
      [sourceUserId, lead.query]
    );
    if (dup[0]) return null;
  }

  const id = `lead-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (sourceUserId) await ensureUser(sourceUserId);

  const rows = await query<ServiceLeadRow>(
    `INSERT INTO service_leads (
       id, source_user_id, title, city, category, summary, urgency,
       budget_hint, lead_price, hidden_contact, contact_phone,
       required_specialties, query_text
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, source_user_id, title, city, category, summary, urgency,
       budget_hint, lead_price, hidden_contact, contact_phone,
       required_specialties, query_text, created_at,
       false AS opened`,
    [
      id,
      sourceUserId ?? null,
      lead.title,
      lead.city,
      lead.category,
      lead.summary,
      lead.urgency,
      lead.budgetHint,
      lead.leadPrice,
      lead.hiddenContact,
      lead.contactPhone,
      lead.requiredSpecialties,
      lead.query ?? null,
    ]
  );
  const row = rows[0];
  if (!row) return null;
  return mapServiceLeadRow(row, false);
}

export async function getServiceLeadsForProvider(
  providerId: string
): Promise<ApiServiceLead[]> {
  const provider = await getUser(providerId);
  const rows = await query<ServiceLeadRow>(
    `SELECT sl.id, sl.source_user_id, sl.title, sl.city, sl.category, sl.summary,
            sl.urgency, sl.budget_hint, sl.lead_price, sl.hidden_contact, sl.contact_phone,
            sl.required_specialties, sl.query_text, sl.created_at,
            (slo.provider_id IS NOT NULL) AS opened
     FROM service_leads sl
     LEFT JOIN service_lead_opens slo
       ON sl.id = slo.lead_id AND slo.provider_id = $1
     WHERE sl.created_at > now() - interval '30 days'
     ORDER BY sl.created_at DESC
     LIMIT 100`,
    [providerId]
  );

  return rows
    .filter((row) =>
      serviceLeadMatchesProviderRow(row, {
        serviceBaseCity: provider?.serviceBaseCity,
        serviceNationwide: provider?.serviceNationwide,
        serviceSpecialties: provider?.serviceSpecialties,
      })
    )
    .map((row) => mapServiceLeadRow(row, row.opened));
}

export async function openServiceLeadWallet(
  providerId: string,
  leadId: string,
  cost: number
): Promise<{ walletBalance: number; lead: ApiServiceLead } | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingOpen = await client.query(
      `SELECT 1 FROM service_lead_opens WHERE lead_id = $1 AND provider_id = $2`,
      [leadId, providerId]
    );
    if (existingOpen.rows[0]) {
      const leadRows = await client.query<ServiceLeadRow>(
        `SELECT sl.id, sl.source_user_id, sl.title, sl.city, sl.category, sl.summary,
                sl.urgency, sl.budget_hint, sl.lead_price, sl.hidden_contact, sl.contact_phone,
                sl.required_specialties, sl.query_text, sl.created_at, true AS opened
         FROM service_leads sl WHERE sl.id = $1`,
        [leadId]
      );
      const balRows = await client.query<{ wallet_balance: string }>(
        `SELECT wallet_balance FROM users WHERE id = $1`,
        [providerId]
      );
      await client.query("COMMIT");
      const row = leadRows.rows[0];
      if (!row || !balRows.rows[0]) return null;
      return {
        walletBalance: Number(balRows.rows[0].wallet_balance),
        lead: mapServiceLeadRow(row, true),
      };
    }

    const balRows = await client.query<{ wallet_balance: string }>(
      `UPDATE users SET wallet_balance = wallet_balance - $2, updated_at = now()
       WHERE id = $1 AND wallet_balance >= $2
       RETURNING wallet_balance`,
      [providerId, cost]
    );
    if (!balRows.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const leadRows = await client.query<ServiceLeadRow>(
      `SELECT id, source_user_id, title, city, category, summary, urgency,
              budget_hint, lead_price, hidden_contact, contact_phone,
              required_specialties, query_text, created_at, false AS opened
       FROM service_leads WHERE id = $1`,
      [leadId]
    );
    if (!leadRows.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `INSERT INTO service_lead_opens (lead_id, provider_id, price_paid)
       VALUES ($1, $2, $3)`,
      [leadId, providerId, cost]
    );

    const txId = `wtx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, amount, kind)
       VALUES ($1, $2, $3, 'service_lead')`,
      [txId, providerId, -cost]
    );

    await client.query("COMMIT");
    return {
      walletBalance: Number(balRows.rows[0].wallet_balance),
      lead: mapServiceLeadRow(leadRows.rows[0], true),
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getAdminAgentContext(adminUserId: string): Promise<string> {
  const rows = await query<{ context_text: string }>(
    `SELECT context_text FROM admin_agent_context WHERE admin_user_id = $1`,
    [adminUserId]
  );
  return rows[0]?.context_text ?? "";
}

export async function setAdminAgentContext(
  adminUserId: string,
  contextText: string
): Promise<string> {
  const trimmed = contextText.slice(0, 80_000);
  await query(
    `INSERT INTO admin_agent_context (admin_user_id, context_text, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (admin_user_id) DO UPDATE SET
       context_text = EXCLUDED.context_text,
       updated_at = NOW()`,
    [adminUserId, trimmed]
  );
  return trimmed;
}

export interface UserPreferencesRow {
  userId: string;
  defaultRegion?: string;
  preferredCategories: string[];
  preferredSizes: string[];
  primaryVehicle?: Record<string, unknown> | null;
  wardrobeMode: boolean;
  notificationPrefs: Record<string, unknown>;
  usageIntent?: string;
  shoeSizeEu?: string;
  clothingSize?: string;
  bodyMeasurements?: Record<string, unknown>;
  purchasePrefs?: string[];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function getUserPreferences(
  userId: string
): Promise<UserPreferencesRow | null> {
  type PrefRow = {
    user_id: string;
    default_region: string | null;
    preferred_categories: unknown;
    preferred_sizes: unknown;
    primary_vehicle: Record<string, unknown> | null;
    wardrobe_mode: boolean;
    notification_prefs: Record<string, unknown> | null;
    usage_intent: string | null;
    shoe_size_eu?: string | null;
    clothing_size?: string | null;
    body_measurements?: unknown;
    purchase_prefs?: unknown;
  };

  let rows: PrefRow[] = [];
  try {
    rows = await query<PrefRow>(
      `SELECT user_id, default_region, preferred_categories, preferred_sizes,
              primary_vehicle, wardrobe_mode, notification_prefs, usage_intent,
              shoe_size_eu, clothing_size, body_measurements, purchase_prefs
       FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
  } catch {
    rows = await query<PrefRow>(
      `SELECT user_id, default_region, preferred_categories, preferred_sizes,
              primary_vehicle, wardrobe_mode, notification_prefs, usage_intent
       FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
  }
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    defaultRegion: row.default_region ?? undefined,
    preferredCategories: asStringArray(row.preferred_categories),
    preferredSizes: asStringArray(row.preferred_sizes),
    primaryVehicle: row.primary_vehicle ?? undefined,
    wardrobeMode: row.wardrobe_mode,
    notificationPrefs: row.notification_prefs ?? {},
    usageIntent: row.usage_intent ?? undefined,
    shoeSizeEu: row.shoe_size_eu ?? undefined,
    clothingSize: row.clothing_size ?? undefined,
    bodyMeasurements: asObject(row.body_measurements),
    purchasePrefs: asStringArray(row.purchase_prefs),
  };
}

export async function upsertUserPreferences(
  userId: string,
  prefs: Partial<Omit<UserPreferencesRow, "userId">>
): Promise<UserPreferencesRow> {
  await ensureUser(userId);
  const existing = await getUserPreferences(userId);
  const clearVehicle = prefs.primaryVehicle === null;
  const merged: UserPreferencesRow = {
    userId,
    defaultRegion: prefs.defaultRegion ?? existing?.defaultRegion,
    preferredCategories:
      prefs.preferredCategories ?? existing?.preferredCategories ?? [],
    preferredSizes: prefs.preferredSizes ?? existing?.preferredSizes ?? [],
    primaryVehicle: clearVehicle
      ? null
      : (prefs.primaryVehicle ?? existing?.primaryVehicle ?? null),
    wardrobeMode: prefs.wardrobeMode ?? existing?.wardrobeMode ?? false,
    notificationPrefs:
      prefs.notificationPrefs ?? existing?.notificationPrefs ?? {},
    usageIntent: prefs.usageIntent ?? existing?.usageIntent,
    shoeSizeEu:
      prefs.shoeSizeEu !== undefined
        ? String(prefs.shoeSizeEu || "").trim() || undefined
        : existing?.shoeSizeEu,
    clothingSize:
      prefs.clothingSize !== undefined
        ? String(prefs.clothingSize || "").trim() || undefined
        : existing?.clothingSize,
    bodyMeasurements:
      prefs.bodyMeasurements !== undefined
        ? asObject(prefs.bodyMeasurements)
        : (existing?.bodyMeasurements ?? {}),
    purchasePrefs:
      prefs.purchasePrefs !== undefined
        ? asStringArray(prefs.purchasePrefs)
        : (existing?.purchasePrefs ?? []),
  };
  try {
    await query(
      `INSERT INTO user_preferences (
         user_id, default_region, preferred_categories, preferred_sizes,
         primary_vehicle, wardrobe_mode, notification_prefs, usage_intent,
         shoe_size_eu, clothing_size, body_measurements, purchase_prefs, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         default_region = COALESCE(EXCLUDED.default_region, user_preferences.default_region),
         preferred_categories = EXCLUDED.preferred_categories,
         preferred_sizes = EXCLUDED.preferred_sizes,
         primary_vehicle = EXCLUDED.primary_vehicle,
         wardrobe_mode = EXCLUDED.wardrobe_mode,
         notification_prefs = EXCLUDED.notification_prefs,
         usage_intent = COALESCE(EXCLUDED.usage_intent, user_preferences.usage_intent),
         shoe_size_eu = EXCLUDED.shoe_size_eu,
         clothing_size = EXCLUDED.clothing_size,
         body_measurements = EXCLUDED.body_measurements,
         purchase_prefs = EXCLUDED.purchase_prefs,
         updated_at = NOW()`,
      [
        userId,
        merged.defaultRegion ?? null,
        JSON.stringify(merged.preferredCategories),
        JSON.stringify(merged.preferredSizes),
        merged.primaryVehicle ? JSON.stringify(merged.primaryVehicle) : null,
        merged.wardrobeMode,
        JSON.stringify(merged.notificationPrefs),
        merged.usageIntent ?? null,
        merged.shoeSizeEu ?? null,
        merged.clothingSize ?? null,
        JSON.stringify(merged.bodyMeasurements ?? {}),
        JSON.stringify(merged.purchasePrefs ?? []),
      ]
    );
  } catch {
    // Pre-migration fallback — keep core prefs writable if 031 not applied yet.
    await query(
      `INSERT INTO user_preferences (
         user_id, default_region, preferred_categories, preferred_sizes,
         primary_vehicle, wardrobe_mode, notification_prefs, usage_intent, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         default_region = COALESCE(EXCLUDED.default_region, user_preferences.default_region),
         preferred_categories = EXCLUDED.preferred_categories,
         preferred_sizes = EXCLUDED.preferred_sizes,
         primary_vehicle = EXCLUDED.primary_vehicle,
         wardrobe_mode = EXCLUDED.wardrobe_mode,
         notification_prefs = EXCLUDED.notification_prefs,
         usage_intent = COALESCE(EXCLUDED.usage_intent, user_preferences.usage_intent),
         updated_at = NOW()`,
      [
        userId,
        merged.defaultRegion ?? null,
        JSON.stringify(merged.preferredCategories),
        JSON.stringify(merged.preferredSizes),
        merged.primaryVehicle ? JSON.stringify(merged.primaryVehicle) : null,
        merged.wardrobeMode,
        JSON.stringify(merged.notificationPrefs),
        merged.usageIntent ?? null,
      ]
    );
  }
  return merged;
}

export async function insertUserBehaviorEvents(
  userId: string,
  events: { type: string; payload?: Record<string, unknown>; at?: number }[]
): Promise<void> {
  if (!events.length) return;
  await ensureUser(userId);
  for (const event of events.slice(0, 30)) {
    const id = `beh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await query(
      `INSERT INTO user_behavior_events (id, user_id, type, payload, created_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
      [
        id,
        userId,
        event.type,
        event.payload ? JSON.stringify(event.payload) : null,
        event.at ?? Date.now(),
      ]
    );
  }
}

const LISTING_EVENT_TYPES = new Set([
  "view",
  "contact",
  "share_story",
  "price_advice_shown",
  "price_advice_applied",
]);

/** Phase 0 listing telemetry — best-effort; never throws to callers via route wrapper. */
export async function insertListingEvents(
  events: {
    type: string;
    listingId?: string | null;
    userId?: string | null;
    payload?: Record<string, unknown>;
  }[]
): Promise<number> {
  if (!events.length) return 0;
  let inserted = 0;
  for (const event of events.slice(0, 40)) {
    const type = String(event.type ?? "").trim();
    if (!LISTING_EVENT_TYPES.has(type)) continue;
    const id = `le-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const listingId = event.listingId ? String(event.listingId).slice(0, 120) : null;
    const userId = event.userId ? String(event.userId).slice(0, 120) : null;
    try {
      await query(
        `INSERT INTO listing_events (id, listing_id, user_id, type, payload, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, now())`,
        [
          id,
          listingId,
          userId,
          type,
          JSON.stringify(event.payload ?? {}),
        ]
      );
      inserted += 1;
    } catch {
      // Table may not be migrated yet — swallow so analytics never breaks UX.
    }
  }
  return inserted;
}

export type SellerListingEventAggregate = {
  views: number;
  contacts: number;
  callClicks: number;
  chatStarts: number;
  shareStory: number;
  saves: number;
  interestScore: number;
  promoteSpendEur: number;
  costPerContact: number | null;
};

/** M3 — aggregate listing_events + promote spend for a seller's listings. */
export async function aggregateSellerListingAnalytics(
  sellerId: string,
  days = 30
): Promise<SellerListingEventAggregate> {
  const empty: SellerListingEventAggregate = {
    views: 0,
    contacts: 0,
    callClicks: 0,
    chatStarts: 0,
    shareStory: 0,
    saves: 0,
    interestScore: 0,
    promoteSpendEur: 0,
    costPerContact: null,
  };
  const safeDays = Math.min(90, Math.max(1, Math.floor(days)));
  try {
    const rows = await query<{
      type: string;
      channel: string | null;
      cnt: string;
    }>(
      `SELECT e.type,
              COALESCE(e.payload->>'channel', '') AS channel,
              COUNT(*)::text AS cnt
       FROM listing_events e
       INNER JOIN listings l ON l.id = e.listing_id
       WHERE l.seller_id = $1
         AND e.created_at >= now() - ($2::text || ' days')::interval
         AND e.type IN ('view', 'contact', 'share_story')
       GROUP BY e.type, COALESCE(e.payload->>'channel', '')`,
      [sellerId, String(safeDays)]
    );

    let views = 0;
    let callClicks = 0;
    let chatStarts = 0;
    let contactsOther = 0;
    let shareStory = 0;
    for (const row of rows) {
      const n = Number(row.cnt) || 0;
      if (row.type === "view") views += n;
      else if (row.type === "share_story") shareStory += n;
      else if (row.type === "contact") {
        const ch = String(row.channel ?? "").toLowerCase();
        if (ch === "chat") chatStarts += n;
        else if (ch === "phone" || ch === "call") callClicks += n;
        else contactsOther += n;
      }
    }
    // Untagged contacts (e.g. Omniva order) count toward call/contact ROI.
    callClicks += contactsOther;
    const contacts = callClicks + chatStarts;

    const spendRows = await query<{ spend: string }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0)::text AS spend
       FROM wallet_transactions
       WHERE user_id = $1
         AND kind = 'promote'
         AND created_at >= now() - ($2::text || ' days')::interval`,
      [sellerId, String(safeDays)]
    );
    const promoteSpendEur =
      Math.round((Number(spendRows[0]?.spend) || 0) * 100) / 100;
    const interestScore =
      views > 0
        ? Math.min(99, Math.round((contacts / views) * 100 * 3))
        : 0;
    const costPerContact =
      contacts > 0 && promoteSpendEur > 0
        ? Math.round((promoteSpendEur / contacts) * 100) / 100
        : null;

    return {
      views,
      contacts,
      callClicks,
      chatStarts,
      shareStory,
      saves: 0,
      interestScore,
      promoteSpendEur,
      costPerContact,
    };
  } catch {
    return empty;
  }
}

export async function getRecentUserBehaviorEvents(
  userId: string,
  limit = 20
): Promise<{ type: string; at: number; payload?: Record<string, unknown> }[]> {
  const rows = await query<{
    type: string;
    payload: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT type, payload, created_at
     FROM user_behavior_events
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows.map((row) => ({
    type: row.type,
    at: row.created_at.getTime(),
    payload: row.payload ?? undefined,
  }));
}

export async function shouldFireUserNudge(
  userId: string,
  nudgeKey: string,
  cooldownMs: number
): Promise<boolean> {
  const rows = await query<{ last_fired_at: Date }>(
    `SELECT last_fired_at FROM user_nudges WHERE user_id = $1 AND nudge_key = $2`,
    [userId, nudgeKey]
  );
  const last = rows[0]?.last_fired_at;
  if (!last) return true;
  return Date.now() - last.getTime() >= cooldownMs;
}

export async function markUserNudgeFired(
  userId: string,
  nudgeKey: string,
  payload?: Record<string, unknown>
): Promise<void> {
  await ensureUser(userId);
  await query(
    `INSERT INTO user_nudges (user_id, nudge_key, last_fired_at, payload)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (user_id, nudge_key) DO UPDATE SET
       last_fired_at = NOW(),
       payload = EXCLUDED.payload`,
    [userId, nudgeKey, payload ? JSON.stringify(payload) : null]
  );
}

export interface UserOnboardingRow {
  userId: string;
  step: number;
  completedAt?: string;
  answers: Record<string, unknown>;
}

export async function getUserOnboarding(userId: string): Promise<UserOnboardingRow | null> {
  const rows = await query<{
    user_id: string;
    step: number;
    completed_at: Date | null;
    answers: Record<string, unknown> | null;
  }>(
    `SELECT user_id, step, completed_at, answers FROM user_onboarding WHERE user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    step: row.step,
    completedAt: row.completed_at?.toISOString(),
    answers: row.answers ?? {},
  };
}

export async function upsertUserOnboarding(
  userId: string,
  patch: { step?: number; completedAt?: string | null; answers?: Record<string, unknown> }
): Promise<UserOnboardingRow> {
  await ensureUser(userId);
  const existing = await getUserOnboarding(userId);
  const merged = {
    userId,
    step: patch.step ?? existing?.step ?? 0,
    completedAt:
      patch.completedAt === null
        ? undefined
        : patch.completedAt ?? existing?.completedAt,
    answers: { ...(existing?.answers ?? {}), ...(patch.answers ?? {}) },
  };
  await query(
    `INSERT INTO user_onboarding (user_id, step, completed_at, answers, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       step = EXCLUDED.step,
       completed_at = EXCLUDED.completed_at,
       answers = EXCLUDED.answers,
       updated_at = NOW()`,
    [
      userId,
      merged.step,
      merged.completedAt ? new Date(merged.completedAt) : null,
      JSON.stringify(merged.answers),
    ]
  );
  return merged;
}
