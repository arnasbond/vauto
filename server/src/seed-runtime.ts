import { pool } from "./db.js";
import { DEMO_LISTINGS, DEMO_USER } from "./demo-listings.js";

/** Upsert demo rows — safe on every startup (adds missing listings after deploys). */
export async function seedIfEmpty(): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, name, phone, city, avatar_url)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [DEMO_USER.id, DEMO_USER.name, DEMO_USER.phone, DEMO_USER.city, DEMO_USER.avatar]
  );

  let inserted = 0;
  for (const l of DEMO_LISTINGS) {
    await pool.query(
      `INSERT INTO users (id, name, phone, city) VALUES ($1,'Pardavėjas','+37060000000','Panevėžys')
       ON CONFLICT DO NOTHING`,
      [l.seller_id]
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
}
