#!/usr/bin/env node
/**
 * Soft-launch catalog seed — real http(s) covers, LT titles, multiple categories.
 *
 * Requires demo OTP (non-prod OR VAUTO_ALLOW_DEMO_OTP=true on API).
 *
 *   node scripts/seed-soft-launch-catalog.mjs
 *   node scripts/seed-soft-launch-catalog.mjs --dry-run
 *   VAUTO_API_URL=https://vauto-api.onrender.com node scripts/seed-soft-launch-catalog.mjs
 */
const API = (
  process.env.VAUTO_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://vauto-api.onrender.com"
).replace(/\/$/, "");

const PHONE = process.env.VAUTO_PRO_PHONE ?? "+37060000002";
const OTP = process.env.VAUTO_DEMO_OTP ?? "123456";
const dryRun = process.argv.includes("--dry-run");

const U = (id) =>
  `https://images.unsplash.com/${id}?w=800&h=600&fit=crop&auto=format&q=80`;

/** Curated soft-launch rows — http covers only (no data: blobs). */
const SEED = [
  {
    title: "Medinis ąžuolinis stalas",
    category: "home",
    price: 120,
    description: "Tvirtas ąžuolo stalas 160×90 cm. Vilnius, galimas Omniva.",
    image: U("photo-1617806118233-18e1de247200"),
  },
  {
    title: "Sofa-lova pilka",
    category: "home",
    price: 280,
    description: "Išskleidžiama sofa-lova, švarūs užvalkalai, be defektų.",
    image: U("photo-1555041469-a586c61ea9bc"),
  },
  {
    title: "IKEA Billy lentyna",
    category: "home",
    price: 45,
    description: "Balta Billy lentyna su durelėmis. Surinkta, gatava.",
    image: U("photo-1594026112284-02bb6f3352bb"),
  },
  {
    title: "VW Golf 1.6 TDI",
    category: "vehicles",
    price: 6900,
    description: "2014 m., ~185 tūkst. km, dyzelis, TVR tvarkingas.",
    image: U("photo-1542362567-b07e54358753"),
  },
  {
    title: "BMW 320d Touring",
    category: "vehicles",
    price: 11500,
    description: "2016 m., automatinė, odinis salonas, žieminės padangos.",
    image: U("photo-1555215695-3004980ad54e"),
  },
  {
    title: "Toyota Yaris hibridas",
    category: "vehicles",
    price: 9800,
    description: "Ekonomiškas miesto auto, mažos sąnaudos, vienas savininkas.",
    image: U("photo-1621007947382-bb3c3994e3fb"),
  },
  {
    title: "Grynų nuotekų montavimas",
    category: "services",
    price: 0,
    priceLabel: "Nuo 150 €",
    description: "Valymo įrenginių montavimas ir servisas visoje Lietuvoje.",
    image: U("photo-1621905251189-08b45d6a269e"),
  },
  {
    title: "Automobilių detalizavimas Vilniuje",
    category: "services",
    price: 80,
    description: "Išorės ir salono detalizavimas. Registracija telefonu.",
    image: U("photo-1486262715619-67b85e0b08d3"),
  },
  {
    title: "Santechnikos meistras",
    category: "services",
    price: 40,
    priceLabel: "Nuo 40 €/val.",
    description: "Skubūs iškvietimai, maišytuvų ir vamzdynų remontas.",
    image: U("photo-1581578731548-c64695cc6952"),
  },
  {
    title: "Zara vilnonis paltas M",
    category: "clothing",
    price: 55,
    description: "Moteriškas paltas, dydis M, be dėmių, sezono classic.",
    image: U("photo-1548624313-0396c75e4b1a"),
  },
  {
    title: "Nike Air Max 42",
    category: "clothing",
    price: 70,
    description: "Vyriški bateliai 42, nešioti mažai, originali dėžė.",
    image: U("photo-1542291026-7eec264c27ff"),
  },
  {
    title: "Levi's 501 džinsai 32/32",
    category: "clothing",
    price: 35,
    description: "Klasikiniai mėlyni 501, geros būklės.",
    image: U("photo-1542272604-787c3835535d"),
  },
  {
    title: "iPhone 13 128GB",
    category: "electronics",
    price: 420,
    description: "Baterija 87%, be įtrūkimų, su dėklu ir krovikliu.",
    image: U("photo-1592899677977-9c10ca588bbd"),
  },
  {
    title: "MacBook Air M1",
    category: "electronics",
    price: 750,
    description: "8/256, kosminė pilka, idealus studentui.",
    image: U("photo-1517336714731-489689fd1ca8"),
  },
  {
    title: "Sony WH-1000XM4",
    category: "electronics",
    price: 160,
    description: "Noise cancelling ausinės, su dėklu.",
    image: U("photo-1546435770-a3e426bf472b"),
  },
  {
    title: "2 kamb. butas Šnipiškėse",
    category: "real_estate",
    price: 145000,
    description: "48 m², renovuotas, šilta, parkavimas kieme.",
    image: U("photo-1502672260266-1c1ef2d93688"),
  },
  {
    title: "Programuotojas (React) — remote",
    category: "jobs",
    price: 0,
    priceLabel: "Nuo 2500 €",
    description: "Ieškome mid React programuotojo. LT komanda, remote OK.",
    image: U("photo-1497366811353-6870744d04b2"),
  },
  {
    title: "Bosch smūginis gręžtuvas",
    category: "tools",
    price: 65,
    description: "Komplekte 2 baterijos ir krautuvas. Veikia puikiai.",
    image: U("photo-1504148455328-c376907d081c"),
  },
];

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(opts.token
        ? { Authorization: `Bearer ${opts.token}`, "X-User-Id": opts.userId }
        : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function main() {
  console.log(`Soft-launch seed → ${API} dryRun=${dryRun}`);
  await api("/api/auth/otp/send", { method: "POST", body: { phone: PHONE } });
  const verify = await api("/api/auth/otp/verify", {
    method: "POST",
    body: {
      phone: PHONE,
      code: OTP,
      role: "pro",
      city: "Vilnius",
      profileType: "business",
    },
  });
  if (verify.status !== 200 || !verify.json?.token) {
    console.error(
      "OTP verify failed — need VAUTO_ALLOW_DEMO_OTP=true on production API or local non-prod.",
      verify.status,
      verify.text.slice(0, 300)
    );
    process.exit(1);
  }
  const token = verify.json.token;
  const userId = verify.json.user.id;
  console.log(`seller=${userId}`);

  let created = 0;
  for (const row of SEED) {
    const id = `l-soft-${row.category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const payload = {
      id,
      title: row.title,
      price: row.price,
      ...(row.priceLabel ? { priceLabel: row.priceLabel } : {}),
      location: "Vilnius",
      distanceKm: 1 + Math.floor(Math.random() * 12),
      slug: `${row.title.toLowerCase().replace(/[^a-z0-9ąčęėįšųūž]+/gi, "-").slice(0, 40)}-${Date.now()}`,
      image: row.image,
      images: [row.image],
      category: row.category,
      tags: ["soft-launch", row.category],
      sellerId: userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 864e5).toISOString(),
      description: row.description,
      status: "active",
      contact: PHONE,
      allowPastomatas: row.category !== "jobs" && row.category !== "real_estate",
    };
    if (dryRun) {
      console.log(`[dry] ${row.category}: ${row.title}`);
      created += 1;
      continue;
    }
    const res = await api("/api/listings", {
      method: "POST",
      token,
      userId,
      body: payload,
    });
    if (res.status >= 400) {
      console.error(`FAIL ${row.title}: ${res.status} ${res.text.slice(0, 200)}`);
    } else {
      created += 1;
      console.log(`OK ${row.title} → ${res.json?.id ?? id}`);
    }
  }
  console.log(`Done. created=${created}/${SEED.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
