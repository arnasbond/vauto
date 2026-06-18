import { pool, query } from "./db.js";
import type {
  ApiChatThread,
  ApiEscrowTransaction,
  ApiListing,
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
  }>(
    "SELECT id, name, phone, city, avatar_url, email, warned FROM users WHERE id = $1",
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

export async function upsertUser(user: ApiUser): Promise<void> {
  await query(
    `INSERT INTO users (id, name, phone, city, avatar_url, email, warned)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       phone = EXCLUDED.phone,
       city = EXCLUDED.city,
       avatar_url = EXCLUDED.avatar_url,
       email = EXCLUDED.email,
       warned = EXCLUDED.warned,
       updated_at = now()`,
    [
      user.id,
      user.name,
      user.phone,
      user.city,
      user.avatar,
      user.email ?? null,
      user.warned ?? false,
    ]
  );
}

export async function getListings(): Promise<ApiListing[]> {
  const rows = await query<ListingRow>(
    `${LISTING_SELECT} ORDER BY created_at DESC`
  );
  return rows.map(mapListingRow);
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
  }>(
    `SELECT id, reporter_id, reporter_name, category, urgency, status, comment,
            listing_id, listing_title, chat_id, reported_user_id, chat_preview, created_at
     FROM support_reports ORDER BY created_at DESC`
  );
  return rows.map((r) => ({
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
  }));
}

export async function insertReport(report: ApiSupportReport): Promise<void> {
  await ensureUser(report.reporterId);
  await query(
    `INSERT INTO support_reports (
      id, reporter_id, reporter_name, category, urgency, status, comment,
      listing_id, listing_title, chat_id, reported_user_id, chat_preview, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
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
    ]
  );
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
