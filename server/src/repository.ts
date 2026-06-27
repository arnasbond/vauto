import { pool, query } from "./db.js";
import {
  getDemoApiListings,
  mergeDbListingsWithDemoCatalog,
} from "./demo-catalog-api.js";
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
};

function mapListingRow(r: ListingRow): ApiListing {
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
    image: r.image,
    category: r.category,
    tags: r.tags ?? [],
    contact: r.contact ?? undefined,
    hasVideo: r.has_video,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at?.toISOString(),
    description: r.description ?? undefined,
    attributes: (r.attributes as ApiListing["attributes"]) ?? undefined,
    status: r.status ?? undefined,
    banned: r.banned,
    vinVerified: r.vin_verified,
    providerVerified: r.provider_verified,
    promoted: r.promoted,
  };
}

const LISTING_SELECT = `SELECT id, seller_id, title, price, price_label, location, distance_km,
  latitude, longitude, slug, image, category, tags, contact, has_video, created_at, expires_at,
  description, attributes, status, banned, vin_verified, provider_verified, promoted
  FROM listings`;

export async function getUser(id: string): Promise<ApiUser | null> {
  const rows = await query<{
    id: string;
    name: string;
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
  }>(
    `SELECT id, name, phone, city, avatar_url, email, warned,
            wallet_balance, role, business_type, sold_count, auth_provider,
            billing_plan
     FROM users WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
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
    avatar:
      r.avatar_url ??
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
  };
}

export async function ensureUser(id: string): Promise<void> {
  await query(
    `INSERT INTO users (id, name, phone, city)
     VALUES ($1, 'Vartotojas', '+370', 'Lietuva')
     ON CONFLICT (id) DO NOTHING`,
    [id]
  );
}

/** Persist avatar URL — returns row after write for audit logging. */
export async function updateUserAvatar(
  userId: string,
  avatarUrl: string
): Promise<ApiUser | null> {
  await query(
    `UPDATE users SET avatar_url = $2, updated_at = now() WHERE id = $1`,
    [userId, avatarUrl]
  );
  const updatedUser = await getUser(userId);
  console.log("REAL_DB_WRITE:", updatedUser);
  return updatedUser;
}

export async function upsertUser(user: ApiUser): Promise<void> {
  await query(
    `INSERT INTO users (id, name, phone, city, avatar_url, email, warned,
                        wallet_balance, role, business_type, sold_count, auth_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       phone = EXCLUDED.phone,
       city = EXCLUDED.city,
       avatar_url = EXCLUDED.avatar_url,
       email = EXCLUDED.email,
       warned = EXCLUDED.warned,
       wallet_balance = COALESCE(EXCLUDED.wallet_balance, users.wallet_balance),
       role = COALESCE(EXCLUDED.role, users.role),
       business_type = COALESCE(EXCLUDED.business_type, users.business_type),
       sold_count = COALESCE(EXCLUDED.sold_count, users.sold_count),
       auth_provider = COALESCE(EXCLUDED.auth_provider, users.auth_provider),
       updated_at = now()`,
    [
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
    ]
  );
}

export async function getListings(): Promise<ApiListing[]> {
  try {
    const rows = await query<ListingRow>(
      `${LISTING_SELECT} ORDER BY created_at DESC`
    );
    return mergeDbListingsWithDemoCatalog(rows.map(mapListingRow));
  } catch {
    return getDemoApiListings();
  }
}

export async function insertListing(listing: ApiListing): Promise<void> {
  await ensureUser(listing.sellerId);
  await query(
    `INSERT INTO listings (
      id, seller_id, title, price, price_label, location, distance_km,
      latitude, longitude, slug, image, category, tags, contact, has_video,
      created_at, expires_at, description, attributes, status, banned,
      vin_verified, provider_verified, promoted
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23,$24)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      price = EXCLUDED.price,
      location = EXCLUDED.location,
      distance_km = EXCLUDED.distance_km,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      slug = EXCLUDED.slug,
      image = EXCLUDED.image,
      expires_at = EXCLUDED.expires_at,
      description = EXCLUDED.description,
      attributes = EXCLUDED.attributes,
      status = EXCLUDED.status,
      banned = EXCLUDED.banned,
      vin_verified = EXCLUDED.vin_verified,
      provider_verified = EXCLUDED.provider_verified,
      promoted = EXCLUDED.promoted`,
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
      listing.image,
      listing.category,
      JSON.stringify(listing.tags),
      listing.contact ?? null,
      listing.hasVideo ?? false,
      listing.createdAt,
      listing.expiresAt ?? null,
      listing.description ?? null,
      JSON.stringify(listing.attributes ?? {}),
      listing.status ?? "active",
      listing.banned ?? false,
      listing.vinVerified ?? false,
      listing.providerVerified ?? false,
      listing.promoted ?? false,
    ]
  );

  void import("./ai/listing-embedding.js")
    .then((m) => m.refreshListingEmbedding(listing.id))
    .catch(() => {});
  void import("./ai/image-embedding.js")
    .then((m) => m.refreshListingImageEmbedding(listing.id))
    .catch(() => {});
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
  if (patch.status !== undefined) set("status", patch.status);
  if (patch.banned !== undefined) set("banned", patch.banned);

  if (fields.length === 0) {
    const all = await getListings();
    return all.find((l) => l.id === id) ?? null;
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

  const all = await getListings();
  return all.find((l) => l.id === id) ?? null;
}

/** Admin-only patch — does not require seller_id match. */
export async function adminPatchListing(
  id: string,
  patch: Partial<Pick<ApiListing, "banned" | "status">>
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

  if (fields.length === 0) {
    const all = await getListings();
    return all.find((l) => l.id === id) ?? null;
  }

  values.push(id);
  await query(`UPDATE listings SET ${fields.join(", ")} WHERE id = $${i}`, values);

  const all = await getListings();
  return all.find((l) => l.id === id) ?? null;
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

export async function deleteListing(id: string, sellerId: string): Promise<boolean> {
  const res = await pool.query(
    "DELETE FROM listings WHERE id = $1 AND seller_id = $2",
    [id, sellerId]
  );
  return (res.rowCount ?? 0) > 0;
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
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'admin'`
  );
  return rows.map((r) => r.id);
}

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
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, thread_id, listing_id, buyer_id, seller_id, amount, status,
            tracking_code, created_at, updated_at
     FROM escrow_transactions WHERE thread_id = $1`,
    [threadId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    threadId: r.thread_id,
    listingId: r.listing_id,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    amount: Number(r.amount),
    status: r.status as ApiEscrowTransaction["status"],
    trackingCode: r.tracking_code ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function upsertEscrow(escrow: ApiEscrowTransaction): Promise<void> {
  await ensureUser(escrow.buyerId);
  await ensureUser(escrow.sellerId);
  await query(
    `INSERT INTO escrow_transactions (
      id, thread_id, listing_id, buyer_id, seller_id, amount, status,
      tracking_code, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      tracking_code = EXCLUDED.tracking_code,
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
      escrow.createdAt,
      escrow.updatedAt,
    ]
  );
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

export async function upsertChat(thread: ApiChatThread): Promise<void> {
  await ensureUser(thread.buyerId);
  await ensureUser(thread.sellerId);
  await query(
    `INSERT INTO chat_threads (
      id, listing_id, listing_title, buyer_id, seller_id, escrow_offered,
      last_read_at, sms_fallback_sent_for, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT (id) DO UPDATE SET
       escrow_offered = EXCLUDED.escrow_offered,
       last_read_at = EXCLUDED.last_read_at,
       sms_fallback_sent_for = EXCLUDED.sms_fallback_sent_for,
       updated_at = now()`,
    [
      thread.id,
      thread.listingId,
      thread.listingTitle,
      thread.buyerId,
      thread.sellerId,
      thread.escrowOffered,
      thread.lastReadAt ?? null,
      thread.smsFallbackSentFor ?? null,
    ]
  );

  await pool.query("DELETE FROM chat_messages WHERE thread_id = $1", [thread.id]);
  for (const m of thread.messages) {
    await query(
      `INSERT INTO chat_messages (id, thread_id, sender_id, body, created_at, read_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        m.id,
        thread.id,
        m.senderId,
        m.text,
        m.timestamp,
        m.readAt ?? null,
      ]
    );
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
    created_at: Date;
  }>(
    `SELECT id, seller_id, listing_id, listing_title, reviewer_id, reviewer_name,
            rating, comment, created_at
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
    createdAt: r.created_at.toISOString(),
  }));
}

export async function insertReview(review: ApiReview): Promise<void> {
  await ensureUser(review.reviewerId);
  await ensureUser(review.sellerId);
  await query(
    `INSERT INTO seller_reviews (
      id, seller_id, listing_id, listing_title, reviewer_id, reviewer_name, rating, comment, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
      review.createdAt,
    ]
  );
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
    const durationDays = tier <= 1 ? 7 : tier === 2 ? 14 : tier === 3 ? 30 : tier === 4 ? 60 : 90;
    const expires = new Date();
    expires.setDate(expires.getDate() + durationDays);
    const attrs = {
      ...(existing.rows[0].attributes ?? {}),
      _visibilityTier: String(tier),
      _visibilityExpiresAt: expires.toISOString(),
    };
    const listRows = await client.query<ListingRow>(
      `UPDATE listings SET promoted = true, attributes = $3::jsonb
       WHERE id = $1 AND seller_id = $2
       RETURNING id, seller_id, title, price, price_label, location, distance_km,
         latitude, longitude, slug, image, category, tags, contact, has_video, created_at,
         expires_at, description, attributes, status, banned, vin_verified, provider_verified, promoted`,
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

export async function upsertFcmToken(
  userId: string,
  token: string,
  platform = "android"
): Promise<void> {
  const id = `fcm-${Buffer.from(token).toString("base64url").slice(0, 40)}`;
  await ensureUser(userId);
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
  await query(`DELETE FROM fcm_tokens WHERE user_id = $1 AND token = $2`, [
    userId,
    token,
  ]);
}

export async function getFcmTokensForUsers(
  userIds: string[]
): Promise<{ userId: string; token: string }[]> {
  if (!userIds.length) return [];
  const rows = await query<{ user_id: string; token: string }>(
    `SELECT user_id, token FROM fcm_tokens WHERE user_id = ANY($1::text[])`,
    [userIds]
  );
  return rows.map((r) => ({ userId: r.user_id, token: r.token }));
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

export async function getListingForEmbedding(
  id: string
): Promise<ApiListing | null> {
  const rows = await query<ListingRow>(`${LISTING_SELECT} WHERE id = $1`, [id]);
  return rows[0] ? mapListingRow(rows[0]) : null;
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
     WHERE NOT banned AND COALESCE(status, 'active') = 'active'
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
     WHERE NOT banned AND COALESCE(status, 'active') = 'active'
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
     WHERE NOT banned AND COALESCE(status, 'active') = 'active'
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
  await ensureUser(userId);
  await query(
    `INSERT INTO billing_subscriptions (id, user_id, plan_id, status, stripe_session_id)
     VALUES ($1, $2, $3, 'active', $4)`,
    [subId, userId, planId, stripeSessionId ?? null]
  );
  if (planId === "pro") {
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
