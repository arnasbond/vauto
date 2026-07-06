#!/usr/bin/env node
/**
 * Reset auth state on Render/local API (ops-secret protected).
 *
 * Usage:
 *   node scripts/auth-reset.mjs --dry-run
 *   node scripts/auth-reset.mjs --apply
 *   VAUTO_API_URL=https://vauto-api.onrender.com VAUTO_OPS_SECRET=... node scripts/auth-reset.mjs --apply
 */
const apiUrl = (
  process.env.VAUTO_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://vauto-api.onrender.com"
).replace(/\/$/, "");

const secret = process.env.VAUTO_OPS_SECRET?.trim();
const dryRun = !process.argv.includes("--apply");

async function main() {
  if (!secret) {
    console.error("Set VAUTO_OPS_SECRET to call /api/ops/auth-reset in production.");
    process.exit(1);
  }

  const res = await fetch(`${apiUrl}/api/ops/auth-reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vauto-Ops-Secret": secret,
    },
    body: JSON.stringify({
      dryRun,
      preserveCatalog: true,
      preserveAdmin: false,
    }),
  });

  const data = await res.json().catch(() => ({}));
  console.log(JSON.stringify(data, null, 2));

  if (!res.ok) {
    console.error(`Auth reset failed: HTTP ${res.status}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log("\nDry run only. Re-run with --apply to execute.");
  } else {
    console.log("\nAuth reset applied. Rotate JWT_SECRET on Render to invalidate all JWTs.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
