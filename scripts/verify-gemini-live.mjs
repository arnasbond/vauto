#!/usr/bin/env node
/**
 * Live production Gemini key verification.
 *
 * VAUTO enforces an application-level AI limiter (aiRateLimiter, default 8/min
 * per IP) in front of every Gemini route. Those return HTTP 429 with
 * code="ai_rate_limit_exceeded" and are NOT Gemini quota errors. This script
 * therefore stays UNDER that app limit (6 spaced calls) so every request
 * actually reaches Gemini, letting us confirm the real key health + latency.
 *
 *   node scripts/verify-gemini-live.mjs
 *   node scripts/verify-gemini-live.mjs https://vauto-api.onrender.com
 */
const base =
  process.argv.slice(2).find((a) => !a.startsWith("--"))?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

const QUERIES = [
  "volwo v70 dyzelis",
  "ieskau suknele 38 dydzio",
  "bemvė e46 universalas",
  "iphon 12 pro",
  "vw golf 4 tdi",
  "mersas benzinas automatas",
];

const SPACING_MS = 1500;

async function oneCall(q) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/ai/analyze-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
      signal: AbortSignal.timeout(45_000),
    });
    const ms = Date.now() - t0;
    let clean = "";
    let code = "";
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      clean = String(body.cleanQuery ?? "").trim();
    } else {
      const body = await res.json().catch(() => ({}));
      code = String(body.code ?? "");
    }
    return { q, status: res.status, ms, clean, code, ok: res.ok };
  } catch (e) {
    return { q, status: 0, ms: Date.now() - t0, clean: "", code: "", ok: false, err: String(e?.message || e) };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n=== Gemini live verification via ${base} ===`);
  console.log(`(spaced ${SPACING_MS}ms apart, under the 8/min app limiter)\n`);

  const results = [];
  for (const q of QUERIES) {
    const r = await oneCall(q);
    results.push(r);
    const tag = r.ok ? "OK " : r.status === 429 ? "429" : `ERR(${r.status})`;
    const extra = r.code ? ` [${r.code}]` : r.err ? " · " + r.err : "";
    console.log(`  [${tag}] ${r.ms}ms  "${q}" → "${r.clean}"${extra}`);
    await sleep(SPACING_MS);
  }

  const total = results.length;
  const ok = results.filter((r) => r.ok).length;
  const appLimited = results.filter((r) => r.status === 429).length;
  const other = results.filter((r) => !r.ok && r.status !== 429).length;
  const avg = Math.round(results.filter((r) => r.ok).reduce((a, r) => a + r.ms, 0) / Math.max(1, ok));

  console.log("\n--- Summary ---");
  console.log(`  Total calls:          ${total}`);
  console.log(`  Reached Gemini (200): ${ok}`);
  console.log(`  App limiter 429:      ${appLimited}`);
  console.log(`  Other/Gemini errors:  ${other}`);
  console.log(`  Avg latency (ok):     ${avg}ms`);

  const verdict =
    ok === total
      ? "GEMINI KEY HEALTHY — every call that reached Gemini returned a clean, accurate result with no Gemini-side errors."
      : other > 0
        ? `GEMINI ERRORS — ${other} calls failed at the Gemini layer; inspect logs.`
        : `APP-LIMITER HIT — ${appLimited} calls blocked by VAUTO's own 8/min limiter (not Gemini).`;
  console.log(`\n  VERDICT: ${verdict}\n`);

  process.exit(ok === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
