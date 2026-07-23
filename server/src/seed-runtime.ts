import { pool } from "./db.js";
import { DEMO_LISTINGS, DEMO_USER } from "./demo-listings.js";
import { DEMO_SERVICE_LEADS } from "./demo-service-leads.js";

function demoCatalogSeedEnabled(): boolean {
  const raw = String(process.env.SEED_DEMO_CATALOG ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Optional demo catalog upsert.
 * Production stays clean unless SEED_DEMO_CATALOG=1 — otherwise purged mock
 * catalog rows (lt- / seller- prefixes) would reappear on every Render restart.
 */
export async function seedIfEmpty(): Promise<void> {
  if (!demoCatalogSeedEnabled()) {
    console.log(
      "Demo seed skipped (set SEED_DEMO_CATALOG=1 to insert lt-/seller- mock catalog)."
    );
    return;
  }

  await pool.query(
    `INSERT INTO users (id, name, phone, city, avatar_url)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [DEMO_USER.id, DEMO_USER.name, DEMO_USER.phone, DEMO_USER.city, DEMO_USER.avatar]
  );

  let inserted = 0;
  for (const l of DEMO_LISTINGS) {
    await pool.query(
      `INSERT INTO users (id, name, phone, city) VALUES ($1,'Pardavėjas','+37060000000',$2)
       ON CONFLICT DO NOTHING`,
      [l.seller_id, l.location]
    );

    const res = await pool.query(
      `INSERT INTO listings (
         id, seller_id, title, price, price_label, location, distance_km, image,
         category, tags, has_video, contact, description, attributes,
         provider_verified, vin_verified
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14::jsonb,$15,$16)
       ON CONFLICT (id) DO NOTHING`,
      [
        l.id,
        l.seller_id,
        l.title,
        l.price,
        l.price_label ?? null,
        l.location,
        l.distance_km,
        l.image,
        l.category,
        JSON.stringify(l.tags),
        l.has_video ?? false,
        l.contact ?? null,
        l.description ?? null,
        JSON.stringify(l.attributes ?? {}),
        l.provider_verified ?? false,
        l.vin_verified ?? false,
      ]
    );
    if ((res.rowCount ?? 0) > 0) inserted++;
  }

  if (inserted > 0) {
    console.log(`Demo seed: added ${inserted} listing(s)`);
  }

  let leadsInserted = 0;
  for (const lead of DEMO_SERVICE_LEADS) {
    const createdAt = new Date(Date.now() - lead.minutesAgo * 60 * 1000).toISOString();
    const res = await pool.query(
      `INSERT INTO service_leads (
         id, source_user_id, title, city, category, summary, urgency,
         budget_hint, lead_price, hidden_contact, contact_phone,
         required_specialties, query_text, created_at
       )
       VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        lead.id,
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
        lead.title,
        createdAt,
      ]
    );
    if ((res.rowCount ?? 0) > 0) leadsInserted++;
  }

  if (leadsInserted > 0) {
    console.log(`Demo seed: added ${leadsInserted} service lead(s)`);
  }
}
