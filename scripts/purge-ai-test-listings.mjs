#!/usr/bin/env node
/**
 * Purge AI/test listings via ops API (after deploy) or via Render DATABASE_URL.
 *
 * Prefer GitHub workflow "Purge AI test listings" (uses RENDER_API_KEY).
 *
 * Local / ops:
 *   VAUTO_OPS_SECRET=... node scripts/purge-ai-test-listings.mjs --apply
 *   VAUTO_OPS_SECRET=... node scripts/purge-ai-test-listings.mjs --dry-run
 *
 * Direct DB (DATABASE_URL or RENDER_API_KEY to resolve it):
 *   DATABASE_URL=... node server/scripts/purge-ai-test-listings.mjs
 *   RENDER_API_KEY=... node scripts/purge-ai-test-listings.mjs --via-render --apply
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
const viaRender = process.argv.includes("--via-render");
const viaOps = process.argv.includes("--via-ops") || (!viaRender && Boolean(process.env.VAUTO_OPS_SECRET?.trim()));

async function runViaOps() {
  const apiUrl = (
    process.env.VAUTO_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://vauto-api.onrender.com"
  ).replace(/\/$/, "");
  const secret = process.env.VAUTO_OPS_SECRET?.trim();
  if (!secret) {
    console.error("Set VAUTO_OPS_SECRET to call /api/ops/purge-ai-test-listings");
    process.exit(1);
  }

  const res = await fetch(`${apiUrl}/api/ops/purge-ai-test-listings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vauto-Ops-Secret": secret,
    },
    body: JSON.stringify({ dryRun }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(JSON.stringify(data, null, 2));
  if (!res.ok) {
    console.error(`Purge failed: HTTP ${res.status}`);
    process.exit(1);
  }
  if (dryRun) console.log("\nDry run only. Re-run with --apply to execute.");
}

function runViaRenderDb() {
  const resolve = spawnSync(
    process.execPath,
    [join(root, "scripts/resolve-render-database-url.mjs"), "--print"],
    { encoding: "utf8", env: process.env }
  );
  if (resolve.status !== 0) {
    console.error(resolve.stderr || resolve.stdout || "resolve failed");
    process.exit(resolve.status || 1);
  }
  const url = (resolve.stdout || "").trim();
  if (!url) {
    console.error("Empty DATABASE_URL from Render");
    process.exit(1);
  }
  const args = [join(root, "server/scripts/purge-ai-test-listings.mjs")];
  if (dryRun) args.push("--dry-run");
  const run = spawnSync(process.execPath, args, {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
  process.exit(run.status || 0);
}

async function main() {
  if (viaRender || (!viaOps && process.env.RENDER_API_KEY && !process.env.DATABASE_URL)) {
    runViaRenderDb();
    return;
  }
  if (viaOps) {
    await runViaOps();
    return;
  }
  if (process.env.DATABASE_URL) {
    const args = [join(root, "server/scripts/purge-ai-test-listings.mjs")];
    if (dryRun) args.push("--dry-run");
    const run = spawnSync(process.execPath, args, {
      encoding: "utf8",
      env: process.env,
      stdio: "inherit",
    });
    process.exit(run.status || 0);
  }
  console.error(
    "Need one of: DATABASE_URL, RENDER_API_KEY (--via-render), or VAUTO_OPS_SECRET (--via-ops)."
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
