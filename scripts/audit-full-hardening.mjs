#!/usr/bin/env node
/**
 * Full hardening audit (LIVE HTTP — no mocks):
 *  1) Fuzz / edge-case agent + search inputs
 *  2) Chat UNIQUE (buyer,seller,listing) under parallel PUTs
 *  3) Performance: /api/listings latency + payload (no data: base64 covers)
 *  4) Rate-limit probe (AI tier — stop early on 429)
 *
 *   node scripts/audit-full-hardening.mjs
 *   npm run audit:full-hardening
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = (
  process.env.VAUTO_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://vauto-api.onrender.com"
).replace(/\/$/, "");

const BUYER_PHONE = process.env.VAUTO_SMOKE_PHONE ?? "+37060000001";
const SELLER_PHONE = process.env.VAUTO_PRO_PHONE ?? "+37060000002";
const OTP = process.env.VAUTO_DEMO_OTP ?? "123456";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "test-results");
fs.mkdirSync(outDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  api: API,
  layers: {},
  failures: [],
  insights: [],
};

function fail(layer, msg) {
  report.failures.push({ layer, msg });
  console.error(`  [FAIL][${layer}] ${msg}`);
}

function ok(layer, msg) {
  console.log(`  [OK][${layer}] ${msg}`);
}

async function api(pathname, opts = {}) {
  const started = Date.now();
  const res = await fetch(`${API}${pathname}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(opts.token
        ? { Authorization: `Bearer ${opts.token}`, "X-User-Id": opts.userId ?? "" }
        : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = Date.now() - started;
  let json = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    json = null;
  }
  return { status: res.status, ms, bytes: buf.length, json, text: buf.toString("utf8").slice(0, 500) };
}

async function otpLogin(phone, extra = {}) {
  await api("/api/auth/otp/send", { method: "POST", body: { phone } });
  const v = await api("/api/auth/otp/verify", {
    method: "POST",
    body: { phone, code: OTP, role: extra.role ?? "private", city: "Vilnius", ...extra },
  });
  if (v.status !== 200 || !v.json?.token) {
    throw new Error(`OTP failed ${phone}: ${v.status} ${v.text}`);
  }
  return {
    token: v.json.token,
    userId: v.json.user.id,
    phone,
    role: v.json.user.role,
  };
}

async function layerFuzz(buyer) {
  console.log("\n== 2) FUZZ / EDGE CASES ==");
  const cases = [
    { q: "", label: "empty" },
    { q: "   ", label: "whitespace" },
    { q: "a".repeat(10_000), label: "10k_chars" },
    { q: "'; DROP TABLE listings;--", label: "sql_injection" },
    { q: "<script>alert(1)</script>", label: "xss" },
    { q: "🛋️🔥💯 stalas!!!", label: "emoji" },
    { q: "stalas\u0000null", label: "null_byte" },
    { q: "zzzzzzznonsuchproduct999", label: "zero_results" },
  ];

  const rows = [];
  for (const c of cases) {
    const r = await api("/api/vauto-agent", {
      method: "POST",
      token: buyer.token,
      userId: buyer.userId,
      body: {
        messages: [{ role: "user", text: c.q || "(tuščia)" }],
        context: {
          userId: buyer.userId,
          lastUserQuery: c.q,
          fromSearchBar: true,
          currentView: "home",
        },
      },
      timeoutMs: 180_000,
    });
    const type = r.json?.actions?.type ?? "none";
    const crashed = r.status >= 500;
    const row = {
      label: c.label,
      status: r.status,
      ms: r.ms,
      bytes: r.bytes,
      type,
      crashed,
    };
    rows.push(row);
    if (crashed) fail("fuzz", `${c.label} → HTTP ${r.status}`);
    else ok("fuzz", `${c.label}: ${r.status} type=${type} ${r.ms}ms`);
  }

  // Empty / whitespace must not 5xx; zero-results may be empty_search or lead
  const zero = rows.find((r) => r.label === "zero_results");
  if (zero && !["search", "empty_search", "create_user_requirement", "none", "browse_all"].includes(zero.type)) {
    fail("fuzz", `zero_results unexpected type=${zero.type}`);
  }

  report.layers.fuzz = { rows };
  report.insights.push(
    "Fuzz: agent must never 5xx on empty/SQL/emoji/10k input; zero-hit queries stay soft."
  );
}

async function layerChatUnique(buyer, seller) {
  console.log("\n== 3) CHAT UNIQUE + PARALLEL UPSERT ==");
  const listingId = `l-audit-chat-${Date.now()}`;
  const listingTitle = "Audit Chat Listing";

  // Ensure a listing exists for binding (seller create)
  const create = await api("/api/listings", {
    method: "POST",
    token: seller.token,
    userId: seller.userId,
    body: {
      id: listingId,
      title: listingTitle,
      price: 11,
      location: "Vilnius",
      distanceKm: 1,
      slug: `audit-chat-${Date.now()}`,
      image: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=400",
      images: ["https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=400"],
      category: "home",
      tags: ["audit"],
      sellerId: seller.userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 864e5).toISOString(),
      description: "Audit chat uniqueness probe",
      status: "active",
      contact: seller.phone,
    },
  });
  if (create.status >= 400) {
    fail("chat_unique", `listing create failed: ${create.status} ${create.text}`);
    report.layers.chatUnique = { skipped: true };
    return;
  }

  const enc = (v) => encodeURIComponent(String(v).trim()).replace(/%/g, ".");
  const baseId = `chat_${enc(buyer.userId)}__${enc(seller.userId)}__${enc(listingId)}`;

  const mkThread = (suffix, text) => ({
    id: `${baseId}_${suffix}`,
    listingId,
    listingTitle,
    buyerId: buyer.userId,
    sellerId: seller.userId,
    escrowOffered: false,
    messages: [
      {
        id: `m-audit-${suffix}-${Date.now()}`,
        senderId: buyer.userId,
        text,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  const started = Date.now();
  const parallel = await Promise.all(
    [1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
      api("/api/chats", {
        method: "PUT",
        token: buyer.token,
        userId: buyer.userId,
        body: mkThread(i, `parallel msg ${i}`),
      })
    )
  );
  const ms = Date.now() - started;
  const statuses = parallel.map((p) => p.status);
  const serverCrash = parallel.some((p) => p.status >= 500);
  if (serverCrash) fail("chat_unique", `parallel PUT crashed: ${statuses.join(",")}`);
  else ok("chat_unique", `8 parallel PUTs ok statuses=${[...new Set(statuses)].join(",")} ${ms}ms`);

  const chats = await api(`/api/chats/${buyer.userId}`, {
    token: buyer.token,
    userId: buyer.userId,
  });
  const bound = (Array.isArray(chats.json) ? chats.json : []).filter(
    (c) => c.listingId === listingId
  );
  if (bound.length !== 1) {
    fail(
      "chat_unique",
      `expected exactly 1 thread for listing, got ${bound.length} (UNIQUE buyer+seller+listing)`
    );
  } else {
    ok("chat_unique", `exactly 1 listing-bound thread id=${bound[0].id}`);
  }

  // Cleanup listing (best-effort)
  await api(`/api/listings/${listingId}`, {
    method: "DELETE",
    token: seller.token,
    userId: seller.userId,
  });

  report.layers.chatUnique = {
    parallelMs: ms,
    statuses,
    threadCount: bound.length,
    threadId: bound[0]?.id ?? null,
  };
  report.insights.push(
    "Migration 034 UNIQUE(buyer,seller,listing) + advisory lock: parallel PUTs must collapse to one thread without 5xx."
  );
}

async function layerPerf() {
  console.log("\n== 4) PERFORMANCE & PAYLOAD ==");
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const r = await api("/api/listings?limit=50");
    samples.push(r);
  }
  const okSamples = samples.filter((s) => s.status === 200);
  if (!okSamples.length) {
    fail("perf", "GET /api/listings never 200");
    report.layers.perf = { samples };
    return;
  }
  const latencies = okSamples.map((s) => s.ms).sort((a, b) => a - b);
  const sizes = okSamples.map((s) => s.bytes).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length / 2)];
  const p95 = latencies[latencies.length - 1];
  const maxBytes = sizes[sizes.length - 1];
  const body = okSamples[0].json;
  const items = Array.isArray(body) ? body : body?.items ?? body?.listings ?? [];
  const dataUrlHits = items.filter(
    (l) => typeof l?.image === "string" && l.image.startsWith("data:")
  ).length;

  ok(
    "perf",
    `GET /api/listings p50=${p50}ms p95=${p95}ms maxBytes=${maxBytes} items=${items.length} dataUrlCovers=${dataUrlHits}`
  );
  if (p95 > 15_000) fail("perf", `listings p95 too slow: ${p95}ms`);
  if (maxBytes > 4_000_000) fail("perf", `listings payload too large: ${maxBytes} bytes`);
  if (dataUrlHits > 0) {
    fail("perf", `feed still returns ${dataUrlHits} data:image covers — must strip in LISTING_FEED_SELECT`);
  } else {
    ok("perf", "no data:image covers in feed");
  }

  // Agent search latency spot-check (auth required — passed via outer)
  report.layers.perf = {
    listings: { p50, p95, maxBytes, itemCount: items.length, dataUrlHits, samples: latencies },
  };
  report.insights.push(
    `Feed budget: p95 ${p95}ms / ${maxBytes} B for ${items.length} items; base64 covers must be zero.`
  );
}

async function layerRateLimit(buyer) {
  console.log("\n== 4b) RATE-LIMIT PROBE (AI) ==");
  // Soft probe: 12 quick agent calls — should stay under 20/min default
  let got429 = false;
  let lastStatus = 0;
  const statuses = [];
  for (let i = 0; i < 12; i++) {
    const r = await api("/api/vauto-agent", {
      method: "POST",
      token: buyer.token,
      userId: buyer.userId,
      body: {
        messages: [{ role: "user", text: "stalas" }],
        context: {
          userId: buyer.userId,
          lastUserQuery: "stalas",
          fromSearchBar: true,
        },
      },
      timeoutMs: 120_000,
    });
    statuses.push(r.status);
    lastStatus = r.status;
    if (r.status === 429) {
      got429 = true;
      break;
    }
  }
  ok(
    "rate",
    `12 agent calls last=${lastStatus} hit429=${got429} statuses=${[...new Set(statuses)].join(",")}`
  );
  report.layers.rateLimit = {
    statuses,
    hit429Early: got429,
    note: "Default AI limit 20/min; 12 calls should usually pass. Dedicated search GET tier=40/min.",
  };
  report.insights.push(
    "Rate limits: AI 20/min, API 300/min, search GET 40/min, listing publish 5/hr anon — vision under /api/search gets search tier."
  );
}

async function layerMigrationsOffline() {
  console.log("\n== 3b) MIGRATION FILES 032-034 ==");
  const migDir = path.join(__dirname, "..", "server", "migrations");
  const files = {
    "032": "032_payment_payout_methods.sql",
    "033": "033_sale_notifications.sql",
    "034": "034_chat_threads_listing_unique.sql",
  };
  const checks = {};
  for (const [k, name] of Object.entries(files)) {
    const p = path.join(migDir, name);
    const sql = fs.readFileSync(p, "utf8");
    checks[k] = { file: name, bytes: sql.length };
    if (k === "033" && !/event_key[\s\S]*UNIQUE/i.test(sql)) {
      fail("migrations", "033 missing UNIQUE event_key");
    } else if (k === "033") ok("migrations", "033 sale_notifications.event_key UNIQUE");
    if (k === "034") {
      if (!/idx_chat_threads_buyer_seller_listing/i.test(sql)) {
        fail("migrations", "034 missing unique index name");
      } else if (!/UNIQUE INDEX/i.test(sql)) {
        fail("migrations", "034 missing UNIQUE INDEX");
      } else {
        ok("migrations", "034 UNIQUE (buyer_id, seller_id, listing_id)");
      }
      if (!/ARRAY_AGG/i.test(sql)) {
        fail("migrations", "034 missing dedupe loop");
      } else ok("migrations", "034 dedupe before unique index");
    }
    if (k === "032") {
      if (!/payment_method/i.test(sql)) fail("migrations", "032 missing payment columns");
      else ok("migrations", "032 payment/payout columns present");
    }
  }
  report.layers.migrations = checks;
}

async function main() {
  console.log(`VAUTO full hardening audit → ${API}\n`);
  const health = await api("/api/health", { timeoutMs: 90_000 });
  if (health.status !== 200 || health.json?.ok !== true) {
    fail("health", `API unhealthy: ${health.status}`);
    writeReport();
    process.exit(1);
  }
  ok("health", `db=${health.json?.db ?? "?"} ${health.ms}ms`);

  await layerMigrationsOffline();
  await layerPerf();

  const buyer = await otpLogin(BUYER_PHONE, { role: "private" });
  const seller = await otpLogin(SELLER_PHONE, { role: "pro", profileType: "business" });
  ok("auth", `buyer=${buyer.userId} seller=${seller.userId}`);

  await layerFuzz(buyer);
  await layerChatUnique(buyer, seller);
  await layerRateLimit(buyer);

  writeReport();
  if (report.failures.length) {
    console.error(`\nAUDIT FAILED: ${report.failures.length} issue(s)`);
    process.exit(1);
  }
  console.log("\nAUDIT PASSED");
}

function writeReport() {
  const out = path.join(outDir, "full-hardening-audit.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nWrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  report.failures.push({ layer: "fatal", msg: String(e?.message ?? e) });
  writeReport();
  process.exit(1);
});
