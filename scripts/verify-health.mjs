#!/usr/bin/env node
/**
 * Post-deploy health check — verifies Render API is reachable and reports feature flags.
 *
 * Usage:
 *   node scripts/verify-health.mjs [baseUrl]
 *   node scripts/verify-health.mjs --strict-readiness
 *   STRICT_READINESS=1 node scripts/verify-health.mjs
 */
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const strictReadiness =
  process.argv.includes("--strict-readiness") ||
  process.env.STRICT_READINESS === "1";

const base =
  args[0]?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

async function main() {
  const url = `${base}/api/health`;
  console.log(`Checking ${url} ...`);

  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.ok) {
    console.error("Health check FAILED:", res.status, body);
    process.exit(1);
  }

  console.log("OK — service:", body.service);
  console.log("DB:", body.db ?? "unknown");

  if (body.features) {
    console.log("Features:", JSON.stringify(body.features, null, 2));
    const optionalOff = Object.entries(body.features)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (optionalOff.length && !strictReadiness) {
      console.warn("Optional features not configured:", optionalOff.join(", "));
    }
  }

  if (body.embeddings) {
    console.log("Embeddings:", JSON.stringify(body.embeddings));
  }

  if (body.readiness) {
    console.log("Readiness:", JSON.stringify(body.readiness));
    if (strictReadiness && body.readiness.score < 100) {
      console.error(`Readiness ${body.readiness.score}/100 (expected 100)`);
      process.exit(1);
    }
  } else if (strictReadiness) {
    console.error("Readiness block missing from /api/health");
    process.exit(1);
  }

  if (strictReadiness) {
    console.log(`Strict check passed — readiness ${body.readiness?.score ?? "?"}/100`);
  }
}

main().catch((e) => {
  console.error("Health check error:", e);
  process.exit(1);
});
