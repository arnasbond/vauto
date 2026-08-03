#!/usr/bin/env node
/**
 * Direct DB cover backfill — no OTP. Uses DATABASE_URL or Render API key.
 *
 *   DATABASE_URL=postgres://... node scripts/backfill-listing-covers-db.mjs
 *   RENDER_API_KEY=rnd_... node scripts/backfill-listing-covers-db.mjs
 *   node scripts/backfill-listing-covers-db.mjs --dry-run
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { Client } = require("./server/node_modules/pg");

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

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  if (!process.env.RENDER_API_KEY?.trim()) {
    throw new Error("Set DATABASE_URL or RENDER_API_KEY");
  }
  const r = spawnSync(
    process.execPath,
    ["scripts/resolve-render-database-url.mjs", "--print"],
    { encoding: "utf8", env: process.env }
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "Failed to resolve DATABASE_URL");
  }
  const url = r.stdout.trim();
  if (!url.startsWith("postgres")) {
    throw new Error(`Unexpected DATABASE_URL output: ${url.slice(0, 80)}`);
  }
  return url;
}

async function main() {
  const connectionString = resolveDatabaseUrl();
  const client = new Client({
    connectionString,
    ssl: connectionString.includes("render.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await client.connect();
  console.log(`Cover DB backfill dryRun=${dryRun}`);

  const { rows } = await client.query(
    `SELECT id, title, category, image
     FROM listings
     WHERE COALESCE(status, 'active') NOT IN ('deleted', 'archived')
       AND (
         image IS NULL
         OR TRIM(image) = ''
         OR image LIKE 'data:%'
       )
     ORDER BY created_at DESC
     LIMIT 500`
  );
  console.log(`needCover=${rows.length}`);

  let fixed = 0;
  for (const row of rows) {
    const cover = FALLBACK[row.category] || FALLBACK.other;
    if (dryRun) {
      console.log(`[dry] ${row.id} ${row.title} → ${cover.slice(0, 64)}`);
      fixed += 1;
      continue;
    }
    await client.query(`UPDATE listings SET image = $1 WHERE id = $2`, [
      cover,
      row.id,
    ]);
    fixed += 1;
    console.log(`✓ ${row.id} ${row.title}`);
  }

  await client.end();
  console.log(`done fixed=${fixed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
