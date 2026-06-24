#!/usr/bin/env node
/**
 * Live API smoke: OTP auth → create listings in all categories → cleanup delete.
 *
 * Usage:
 *   node scripts/api-listing-smoke.mjs [baseUrl]
 *   VAUTO_API_URL=https://vauto-api.onrender.com node scripts/api-listing-smoke.mjs
 */
const base =
  process.argv
    .slice(2)
    .find((a) => !a.startsWith("--"))
    ?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

const PHONE = process.env.VAUTO_SMOKE_PHONE ?? "+37060000001";
const OTP = process.env.VAUTO_DEMO_OTP ?? "123456";

const CATEGORY_SAMPLES = [
  { category: "electronics", title: "Smoke iPhone test" },
  { category: "vehicles", title: "Smoke BMW test" },
  { category: "real_estate", title: "Smoke butas test" },
  { category: "clothing", title: "Smoke Nike test" },
  { category: "home", title: "Smoke sofa test" },
  { category: "jobs", title: "Smoke darbas test" },
  { category: "services", title: "Smoke elektrikas test" },
  { category: "other", title: "Smoke kita test" },
];

const IMAGE =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=400&fit=crop";

async function jsonFetch(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

function fail(msg, extra) {
  console.error("FAIL:", msg, extra ?? "");
  process.exit(1);
}

async function authSession() {
  const send = await jsonFetch("/api/auth/otp/send", {
    method: "POST",
    body: JSON.stringify({ phone: PHONE }),
  });
  if (!send.res.ok) fail("OTP send", send.body);

  const verify = await jsonFetch("/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({
      phone: PHONE,
      code: OTP,
      role: "private",
      city: "Vilnius",
    }),
  });
  if (!verify.res.ok) fail("OTP verify", verify.body);

  const token = verify.body?.token;
  const userId = verify.body?.user?.id;
  if (!token || !userId) fail("OTP session missing token/user", verify.body);
  return { token, userId };
}

function buildListing(userId, category, title) {
  const now = new Date().toISOString();
  const id = `l-smoke-${category}-${Date.now()}`;
  return {
    id,
    title,
    price: 99,
    location: "Vilnius",
    distanceKm: 1,
    slug: `smoke-${category}-${Date.now()}`,
    image: IMAGE,
    category,
    tags: ["smoke", category],
    sellerId: userId,
    createdAt: now,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    description: `API smoke listing (${category})`,
    status: "active",
    contact: PHONE,
  };
}

async function main() {
  console.log(`API listing smoke against ${base}`);

  const health = await jsonFetch("/api/health");
  if (!health.res.ok || !health.body?.ok) fail("health", health.body);
  console.log("Health OK — readiness", health.body.readiness?.score ?? "?");

  const { token, userId } = await authSession();
  console.log("Auth OK — user", userId);

  const createdIds = [];

  for (const sample of CATEGORY_SAMPLES) {
    const listing = buildListing(userId, sample.category, sample.title);
    const create = await jsonFetch("/api/listings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(listing),
    });
    if (!create.res.ok) {
      fail(`create ${sample.category}`, create.body);
    }
  console.log(`  ✓ created ${sample.category}: ${listing.id}`);
    createdIds.push(listing.id);
  }

  for (const id of createdIds) {
    const del = await jsonFetch(`/api/listings/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (del.res.status !== 204 && !del.res.ok) {
      fail(`delete ${id}`, del.body);
    }
    console.log(`  ✓ deleted ${id}`);
  }

  console.log(
    `API listing smoke OK — ${CATEGORY_SAMPLES.length} categories create/delete`
  );
}

main().catch((e) => {
  console.error("API listing smoke error:", e);
  process.exit(1);
});
