#!/usr/bin/env node
/**
 * Restore real listing covers after Unsplash/demo pollution.
 *
 * For every remaining (non soft-launch) listing:
 *  1) Prefer a real uploaded URL from listing_media / images JSON / attributes
 *  2) Never invent Unsplash / stock photos
 *  3) If cover is Unsplash/demo and no real upload exists → clear cover
 *
 * Usage:
 *   DATABASE_URL=… node server/scripts/restore-real-listing-covers.mjs
 *   DATABASE_URL=… node server/scripts/restore-real-listing-covers.mjs --dry-run
 */
import "dotenv/config";
import pg from "pg";

const dryRun = process.argv.includes("--dry-run");
let connectionString =
  process.env.DATABASE_URL ?? "postgresql://vauto:vauto@localhost:5432/vauto";

const isLocal =
  /localhost|127\.0\.0\.1/i.test(connectionString) ||
  connectionString.includes("@postgres:");
if (!isLocal && !/[?&]sslmode=/i.test(connectionString)) {
  connectionString += connectionString.includes("?")
    ? "&sslmode=require"
    : "?sslmode=require";
}

const pool = new pg.Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const STOCK_HOST_RE =
  /(?:images\.)?unsplash\.com|source\.unsplash\.com|picsum\.photos|placeholder\.com|via\.placeholder|placehold\.co|loremflickr|dummyimage/i;

function isStockUrl(url) {
  if (!url || typeof url !== "string") return true;
  const t = url.trim();
  if (!t) return true;
  if (t.startsWith("data:")) return true;
  return STOCK_HOST_RE.test(t);
}

function isRealUploadUrl(url) {
  if (!url || typeof url !== "string") return false;
  const t = url.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  if (isStockUrl(t)) return false;
  return true;
}

function parseJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function collectCandidateUrls(row, mediaRows) {
  const out = [];
  const push = (u) => {
    if (typeof u === "string" && u.trim()) out.push(u.trim());
  };

  for (const m of mediaRows || []) push(m.url);

  const images = parseJson(row.images, []);
  if (Array.isArray(images)) {
    for (const u of images) push(u);
  }

  const attrs = parseJson(row.attributes, {});
  if (attrs && typeof attrs === "object") {
    for (const key of [
      "originalImage",
      "originalImages",
      "documentImageUrls",
      "photoUrls",
      "uploadedImages",
      "sourceImages",
      "gallery",
    ]) {
      const v = attrs[key];
      if (typeof v === "string") push(v);
      else if (Array.isArray(v)) for (const u of v) push(u);
    }
  }

  push(row.image);
  return out;
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return rows.length > 0;
}

async function main() {
  const client = await pool.connect();
  try {
    const hasImages = await columnExists(client, "listings", "images");
    const hasAttrs = await columnExists(client, "listings", "attributes");
    const hasMedia = await tableExists(client, "listing_media");

    const cols = ["id", "title", "category", "image", "seller_id", "status"];
    if (hasImages) cols.push("images");
    if (hasAttrs) cols.push("attributes");

    const { rows } = await client.query(
      `SELECT ${cols.join(", ")}
       FROM listings
       WHERE COALESCE(status, 'active') NOT IN ('deleted', 'archived')
         AND id !~* '^(lt-|demo-|seller-|l-soft-)'
       ORDER BY created_at DESC NULLS LAST`
    );

    console.log(
      `[restore-covers] candidates=${rows.length} dryRun=${dryRun} hasImages=${hasImages} hasMedia=${hasMedia}`
    );

    let restored = 0;
    let cleared = 0;
    let kept = 0;

    for (const row of rows) {
      let mediaRows = [];
      if (hasMedia) {
        const m = await client.query(
          `SELECT url, is_primary, sort_order
           FROM listing_media
           WHERE listing_id = $1
           ORDER BY is_primary DESC NULLS LAST, sort_order ASC NULLS LAST, created_at ASC NULLS LAST`,
          [row.id]
        );
        mediaRows = m.rows;
      }

      const candidates = collectCandidateUrls(row, mediaRows);
      const realUrls = [...new Set(candidates.filter(isRealUploadUrl))];
      const coverIsStock = isStockUrl(row.image);

      if (!coverIsStock && isRealUploadUrl(row.image)) {
        kept += 1;
        continue;
      }

      if (realUrls.length) {
        const cover = realUrls[0];
        const gallery = realUrls.slice(0, 12);
        console.log(
          `RESTORE ${row.id} ${String(row.title).slice(0, 48)} → ${cover.slice(0, 72)}`
        );
        if (!dryRun) {
          if (hasImages) {
            await client.query(
              `UPDATE listings SET image = $1, images = $2::jsonb WHERE id = $3`,
              [cover, JSON.stringify(gallery), row.id]
            );
          } else {
            await client.query(`UPDATE listings SET image = $1 WHERE id = $2`, [
              cover,
              row.id,
            ]);
          }
        }
        restored += 1;
        continue;
      }

      if (coverIsStock) {
        console.log(
          `CLEAR  ${row.id} ${String(row.title).slice(0, 48)} (no real upload found)`
        );
        if (!dryRun) {
          if (hasImages) {
            await client.query(
              `UPDATE listings SET image = NULL, images = '[]'::jsonb WHERE id = $1`,
              [row.id]
            );
          } else {
            await client.query(`UPDATE listings SET image = NULL WHERE id = $1`, [
              row.id,
            ]);
          }
        }
        cleared += 1;
      } else {
        kept += 1;
      }
    }

    console.log(
      `[restore-covers] done restored=${restored} cleared=${cleared} kept=${kept}`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[restore-covers] FAILED:", err.message || err);
  process.exit(1);
});
