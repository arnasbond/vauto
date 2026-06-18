import { pool, query } from "./db.js";
export async function getUser(id) {
    const rows = await query("SELECT id, name, phone, city, avatar_url FROM users WHERE id = $1", [id]);
    const r = rows[0];
    if (!r)
        return null;
    return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        city: r.city,
        avatar: r.avatar_url ??
            "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
    };
}
export async function ensureUser(id) {
    await query(`INSERT INTO users (id, name, phone, city)
     VALUES ($1, 'Vartotojas', '+370', 'Lietuva')
     ON CONFLICT (id) DO NOTHING`, [id]);
}
export async function upsertUser(user) {
    await query(`INSERT INTO users (id, name, phone, city, avatar_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       phone = EXCLUDED.phone,
       city = EXCLUDED.city,
       avatar_url = EXCLUDED.avatar_url,
       updated_at = now()`, [user.id, user.name, user.phone, user.city, user.avatar]);
}
export async function getListings() {
    const rows = await query(`SELECT id, seller_id, title, price, price_label, location, distance_km,
            image, category, tags, contact, has_video, created_at, expires_at
     FROM listings ORDER BY created_at DESC`);
    return rows.map((r) => ({
        id: r.id,
        sellerId: r.seller_id,
        title: r.title,
        price: Number(r.price),
        priceLabel: r.price_label ?? undefined,
        location: r.location,
        distanceKm: Number(r.distance_km),
        image: r.image,
        category: r.category,
        tags: r.tags ?? [],
        contact: r.contact ?? undefined,
        hasVideo: r.has_video,
        createdAt: r.created_at.toISOString(),
        expiresAt: r.expires_at?.toISOString(),
    }));
}
export async function insertListing(listing) {
    await ensureUser(listing.sellerId);
    await query(`INSERT INTO listings (
      id, seller_id, title, price, price_label, location, distance_km,
      image, category, tags, contact, has_video, created_at, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      price = EXCLUDED.price,
      location = EXCLUDED.location,
      distance_km = EXCLUDED.distance_km,
      image = EXCLUDED.image,
      expires_at = EXCLUDED.expires_at`, [
        listing.id,
        listing.sellerId,
        listing.title,
        listing.price,
        listing.priceLabel ?? null,
        listing.location,
        listing.distanceKm,
        listing.image,
        listing.category,
        JSON.stringify(listing.tags),
        listing.contact ?? null,
        listing.hasVideo ?? false,
        listing.createdAt,
        listing.expiresAt ?? null,
    ]);
}
export async function renewListing(id, sellerId) {
    const rows = await query("SELECT created_at FROM listings WHERE id = $1 AND seller_id = $2", [id, sellerId]);
    if (!rows[0])
        return null;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    await query(`UPDATE listings SET expires_at = $1, created_at = now() WHERE id = $2 AND seller_id = $3`, [expiresAt.toISOString(), id, sellerId]);
    const all = await getListings();
    return all.find((l) => l.id === id) ?? null;
}
export async function deleteListing(id, sellerId) {
    const res = await pool.query("DELETE FROM listings WHERE id = $1 AND seller_id = $2", [id, sellerId]);
    return (res.rowCount ?? 0) > 0;
}
export async function getSavedIds(userId) {
    const rows = await query("SELECT listing_id FROM saved_listings WHERE user_id = $1", [userId]);
    return rows.map((r) => r.listing_id);
}
export async function setSavedIds(userId, ids) {
    await ensureUser(userId);
    await pool.query("DELETE FROM saved_listings WHERE user_id = $1", [userId]);
    for (const listingId of ids) {
        await pool.query(`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`, [userId, listingId]);
    }
}
export async function getEscrowForThread(threadId) {
    const rows = await query(`SELECT id, thread_id, listing_id, buyer_id, seller_id, amount, status,
            tracking_code, created_at, updated_at
     FROM escrow_transactions WHERE thread_id = $1`, [threadId]);
    const r = rows[0];
    if (!r)
        return null;
    return {
        id: r.id,
        threadId: r.thread_id,
        listingId: r.listing_id,
        buyerId: r.buyer_id,
        sellerId: r.seller_id,
        amount: Number(r.amount),
        status: r.status,
        trackingCode: r.tracking_code ?? undefined,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
    };
}
export async function upsertEscrow(escrow) {
    await ensureUser(escrow.buyerId);
    await ensureUser(escrow.sellerId);
    await query(`INSERT INTO escrow_transactions (
      id, thread_id, listing_id, buyer_id, seller_id, amount, status,
      tracking_code, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      tracking_code = EXCLUDED.tracking_code,
      updated_at = EXCLUDED.updated_at`, [
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
    ]);
}
export async function getChats(userId) {
    const threads = await query(`SELECT id, listing_id, listing_title, buyer_id, seller_id, escrow_offered
     FROM chat_threads
     WHERE buyer_id = $1 OR seller_id = $1
     ORDER BY updated_at DESC`, [userId]);
    const result = [];
    for (const t of threads) {
        const messages = await query(`SELECT id, sender_id, body, created_at FROM chat_messages
       WHERE thread_id = $1 ORDER BY created_at ASC`, [t.id]);
        result.push({
            id: t.id,
            listingId: t.listing_id,
            listingTitle: t.listing_title,
            buyerId: t.buyer_id,
            sellerId: t.seller_id,
            escrowOffered: t.escrow_offered,
            escrow: await getEscrowForThread(t.id),
            messages: messages.map((m) => ({
                id: m.id,
                senderId: m.sender_id,
                text: m.body,
                timestamp: m.created_at.toISOString(),
            })),
        });
    }
    return result;
}
export async function upsertChat(thread) {
    await ensureUser(thread.buyerId);
    await ensureUser(thread.sellerId);
    await query(`INSERT INTO chat_threads (id, listing_id, listing_title, buyer_id, seller_id, escrow_offered, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (id) DO UPDATE SET
       escrow_offered = EXCLUDED.escrow_offered,
       updated_at = now()`, [
        thread.id,
        thread.listingId,
        thread.listingTitle,
        thread.buyerId,
        thread.sellerId,
        thread.escrowOffered,
    ]);
    await pool.query("DELETE FROM chat_messages WHERE thread_id = $1", [thread.id]);
    for (const m of thread.messages) {
        await query(`INSERT INTO chat_messages (id, thread_id, sender_id, body, created_at)
       VALUES ($1,$2,$3,$4,$5)`, [m.id, thread.id, m.senderId, m.text, m.timestamp]);
    }
}
