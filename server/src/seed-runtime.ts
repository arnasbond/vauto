import { pool } from "./db.js";

const MOCK_USER = {
  id: "user-1",
  name: "Jonas K.",
  phone: "+370 612 34567",
  city: "Panevėžys",
  avatar:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
};

const LISTINGS = [
  {
    id: "l-bike",
    seller_id: "seller-bike",
    title: "Dviratis 'Trek'",
    price: 150,
    location: "Panevėžys",
    distance_km: 0.8,
    image:
      "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=400&h=300&fit=crop",
    category: "other",
    tags: ["dviratis", "trek"],
    has_video: true,
  },
  {
    id: "l-phone",
    seller_id: "seller-phone",
    title: "Mobilus telefonas",
    price: 220,
    location: "Panevėžys",
    distance_km: 2,
    image:
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop",
    category: "electronics",
    tags: ["telefonas"],
    has_video: false,
  },
];

/** Seed demo rows when the database is empty (production bootstrap). */
export async function seedIfEmpty(): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM listings"
  );
  if (Number(rows[0]?.count) > 0) return;

  await pool.query(
    `INSERT INTO users (id, name, phone, city, avatar_url)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [MOCK_USER.id, MOCK_USER.name, MOCK_USER.phone, MOCK_USER.city, MOCK_USER.avatar]
  );

  for (const l of LISTINGS) {
    await pool.query(
      `INSERT INTO users (id, name, phone, city) VALUES ($1,'Pardavėjas','+37060000000','Panevėžys')
       ON CONFLICT DO NOTHING`,
      [l.seller_id]
    );
    await pool.query(
      `INSERT INTO listings (id, seller_id, title, price, location, distance_km, image, category, tags, has_video)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) ON CONFLICT DO NOTHING`,
      [
        l.id,
        l.seller_id,
        l.title,
        l.price,
        l.location,
        l.distance_km,
        l.image,
        l.category,
        JSON.stringify(l.tags),
        l.has_video,
      ]
    );
  }

  console.log("Demo seed applied (empty database)");
}
