#!/usr/bin/env node
/**
 * Backfill empty / data: listing covers with category http(s) Unsplash URLs.
 * Updates via authenticated seller PATCH/PUT when available, else re-POST skip.
 *
 * Prefer: ops with seller token. Uses /api/listings + /api/listings/:id when
 * seller owns the row (soft-launch seller phone).
 *
 *   node scripts/backfill-listing-covers.mjs
 *   node scripts/backfill-listing-covers.mjs --dry-run
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

const FALLBACK = {
  vehicles: U("photo-1555215695-3004980ad54e"),
  transport: U("photo-1558618666-fcd25c85cd64"),
  electronics: U("photo-1511707171634-5f897ff02aa9"),
  services: U("photo-1486262715619-67b85e0b08d3"),
  jobs: U("photo-1497366811353-6870744d04b2"),
  home: U("photo-1617806118233-18e1de247200"),
  clothing: U("photo-1551028719-00167b16eac5"),
  real_estate: U("photo-1560518883-ce09059eeffa"),
  tools: U("photo-1581092918056-0c4c3acd3789"),
  rental: U("photo-1486262715619-67b85e0b08d3"),
  other: U("photo-1571068316344-75bc76f77890"),
};

function needsCover(image) {
  if (!image || typeof image !== "string") return true;
  const t = image.trim();
  return !t || t.startsWith("data:");
}

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
  console.log(`Cover backfill → ${API} dryRun=${dryRun}`);
  await api("/api/auth/otp/send", { method: "POST", body: { phone: PHONE } });
  const verify = await api("/api/auth/otp/verify", {
    method: "POST",
    body: { phone: PHONE, code: OTP, role: "pro", city: "Vilnius", profileType: "business" },
  });
  if (verify.status !== 200 || !verify.json?.token) {
    console.error("OTP failed", verify.status, verify.text.slice(0, 200));
    process.exit(1);
  }
  const token = verify.json.token;
  const userId = verify.json.user.id;

  const feed = await api("/api/listings?limit=100");
  const items = Array.isArray(feed.json) ? feed.json : feed.json?.items ?? [];
  const broken = items.filter((l) => needsCover(l.image));
  console.log(`feed=${items.length} needCover=${broken.length}`);

  let fixed = 0;
  let skipped = 0;
  for (const row of broken) {
    const cover = FALLBACK[row.category] || FALLBACK.other;
    if (dryRun) {
      console.log(`[dry] ${row.id} ${row.title} → ${cover.slice(0, 60)}`);
      fixed += 1;
      continue;
    }
    // Only seller can patch own listings — try PATCH body
    const patch = await api(`/api/listings/${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      token,
      userId,
      body: {
        image: cover,
        images: [cover, ...((row.images || []).filter((u) => u && !String(u).startsWith("data:")))].slice(0, 6),
      },
    });
    if (patch.status < 400) {
      fixed += 1;
      console.log(`OK ${row.id}`);
    } else {
      skipped += 1;
      console.warn(`SKIP ${row.id} ${patch.status} ${patch.text.slice(0, 120)}`);
    }
  }
  console.log(`Done fixed=${fixed} skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
