#!/usr/bin/env node
/**
 * Post-deploy health check — verifies Render API is reachable and reports feature flags.
 * Usage: node scripts/verify-health.mjs [baseUrl]
 */
const base =
  process.argv[2]?.replace(/\/$/, "") ||
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
    const missing = Object.entries(body.features)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      console.warn("Optional features not configured:", missing.join(", "));
    }
  }
}

main().catch((e) => {
  console.error("Health check error:", e);
  process.exit(1);
});
