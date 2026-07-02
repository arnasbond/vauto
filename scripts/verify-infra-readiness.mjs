#!/usr/bin/env node
/**
 * Infrastructure readiness check — reads /api/health infra block.
 *
 * Usage:
 *   node scripts/verify-infra-readiness.mjs [baseUrl]
 *   node scripts/verify-infra-readiness.mjs --strict
 */
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const strict = process.argv.includes("--strict") || process.env.INFRA_STRICT === "1";

const base =
  args[0]?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

async function main() {
  const url = `${base}/api/health`;
  console.log(`Checking infra readiness at ${url} ...`);

  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.ok) {
    console.error("Health check FAILED:", res.status, body);
    process.exit(1);
  }

  const infra = body.infra;
  if (!infra) {
    console.error("infra block missing from /api/health");
    process.exit(1);
  }

  console.log("Infra readiness:", JSON.stringify(infra, null, 2));

  if (infra.warnings?.length) {
    console.warn("Warnings:", infra.warnings.join("; "));
  }

  if (strict && infra.warnings?.length) {
    console.error("Strict mode: unresolved infra warnings");
    process.exit(1);
  }

  console.log("Infra readiness check OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
