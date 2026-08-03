#!/usr/bin/env node
/**
 * Dump + fix one listing cover from any nested http(s) URLs in attributes/image.
 * Prefer Cloudinary / non-stock; never invent Unsplash.
 *
 *   DATABASE_URL=... node server/scripts/fix-listing-cover.mjs --title "HOHNER"
 *   DATABASE_URL=... node server/scripts/fix-listing-cover.mjs --id l-...
 */
import "dotenv/config";
import pg from "pg";

const dryRun = process.argv.includes("--dry-run");
const titleArg = (() => {
  const i = process.argv.indexOf("--title");
  return i >= 0 ? String(process.argv[i + 1] || "") : "HOHNER";
})();
const idArg = (() => {
  const i = process.argv.indexOf("--id");
  return i >= 0 ? String(process.argv[i + 1] || "") : "";
})();

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

const STOCK_RE =
  /(?:images\.)?unsplash\.com|picsum\.photos|loremflickr|placehold\.co|via\.placeholder|listing-placeholder/i;

function isRealHttp(url) {
  if (typeof url !== "string") return false;
  const t = url.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  if (STOCK_RE.test(t)) return false;
  if (t.startsWith("data:")) return false;
  return true;
}

function walkUrls(value, out = []) {
  if (typeof value === "string") {
    const t = value.trim();
    if (/^https?:\/\//i.test(t)) out.push(t);
    // Also extract URLs embedded in longer strings / JSON text
    const re = /https?:\/\/[^\s"'\\<>]+/gi;
    let m;
    while ((m = re.exec(value))) out.push(m[0].replace(/[,.);]+$/, ""));
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkUrls(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) walkUrls(v, out);
  }
  return out;
}

const pool = new pg.Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      idArg
        ? `SELECT id, title, category, image, attributes, status, seller_id, created_at
           FROM listings WHERE id = $1`
        : `SELECT id, title, category, image, attributes, status, seller_id, created_at
           FROM listings
           WHERE title ILIKE $1 OR title ILIKE $2
           ORDER BY created_at DESC NULLS LAST
           LIMIT 10`,
      idArg ? [idArg] : [`%${titleArg}%`, "%gitar%"]
    );

    if (!rows.length) {
      console.log("[fix-cover] no matching listings");
      return;
    }

    for (const row of rows) {
      const attrs =
        typeof row.attributes === "string"
          ? JSON.parse(row.attributes)
          : row.attributes || {};
      const found = [
        ...walkUrls(attrs),
        ...walkUrls(row.image),
      ];
      const real = [...new Set(found.filter(isRealHttp))];
      console.log(
        JSON.stringify(
          {
            id: row.id,
            title: row.title,
            status: row.status,
            imageHead: String(row.image || "").slice(0, 140),
            attrKeys: Object.keys(attrs || {}),
            galleryUrls: attrs?.galleryUrls ?? null,
            orderedImageUrls: attrs?.orderedImageUrls ?? null,
            realCandidates: real.slice(0, 8),
          },
          null,
          2
        )
      );

      if (!real.length) {
        console.log(`[fix-cover] ${row.id}: no real http upload in attributes — clearing stock cover`);
        if (!dryRun && /unsplash|picsum/i.test(String(row.image || ""))) {
          await client.query(`UPDATE listings SET image = '' WHERE id = $1`, [
            row.id,
          ]);
        }
        continue;
      }

      const cover = real[0];
      const gallery = real.slice(0, 12);
      const nextAttrs = {
        ...(attrs && typeof attrs === "object" ? attrs : {}),
        galleryUrls: gallery,
      };
      console.log(`[fix-cover] ${row.id}: SET image → ${cover.slice(0, 100)}`);
      if (!dryRun) {
        await client.query(
          `UPDATE listings
           SET image = $1,
               attributes = $2::jsonb
           WHERE id = $3`,
          [cover, JSON.stringify(nextAttrs), row.id]
        );
      }
    }
    console.log("[fix-cover] done");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[fix-cover] FAILED:", e.message || e);
  process.exit(1);
});
