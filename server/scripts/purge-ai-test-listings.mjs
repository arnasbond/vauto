#!/usr/bin/env node
/**
 * Purge AI-generated / temporary test listings from Postgres.
 * Keeps seeded demo catalog rows (ids like lt-auto-001, seller-auto-*).
 *
 * Usage (from server/):
 *   node scripts/purge-ai-test-listings.mjs
 *   node scripts/purge-ai-test-listings.mjs --dry-run
 */
import "dotenv/config";
import pg from "pg";

const dryRun = process.argv.includes("--dry-run");
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://vauto:vauto@localhost:5432/vauto";

const DEMO_ID_RE = /^(lt-|demo-|seller-)/i;

/** AI / test markers in attributes JSON or id shape. */
const AI_ATTR_KEYS = [
  "sellIntentActive",
  "salesCopyGenerated",
  "deferredSalesDescription",
  "clientDraftId",
  "visionQuotaFallback",
  "awaitingSpecs",
  "_vautoCategory",
];

const pool = new pg.Pool({ connectionString });

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return rows.length > 0;
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

function isAiTestListing(row) {
  if (DEMO_ID_RE.test(row.id)) return false;
  if (String(row.seller_id ?? "").startsWith("seller-")) return false;

  let attrs = row.attributes;
  if (typeof attrs === "string") {
    try {
      attrs = JSON.parse(attrs);
    } catch {
      attrs = {};
    }
  }
  attrs = attrs && typeof attrs === "object" ? attrs : {};

  for (const key of AI_ATTR_KEYS) {
    if (attrs[key] != null && String(attrs[key]).trim() !== "") return true;
  }

  // UUID / opaque AI publish ids (not lt-* catalog)
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      row.id
    )
  ) {
    return true;
  }
  // Publish path: listingIdFromClientDraftId → `l-<uuid>` (never `lt-*` demo ids)
  if (/^l-[0-9a-f-]{8,}/i.test(row.id)) return true;
  if (/^(listing-|lst-|ai-|cd-|pub-)/i.test(row.id)) return true;

  // Soft skeleton titles from AI sell clarify during tests
  const title = String(row.title ?? "").trim().toLowerCase();
  if (
    /^(naujas skelbimas|parduodamas?\s+\w{0,24}|paveikslas|prekė|preke|drabužių skelbimas)$/i.test(
      title
    )
  ) {
    return true;
  }

  return false;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: all } = await client.query(
      `SELECT id, seller_id, title, category, status, image, attributes, created_at
       FROM listings
       ORDER BY created_at DESC NULLS LAST`
    );

    const targets = all.filter(isAiTestListing);
    const keep = all.length - targets.length;

    console.log(
      `[purge-ai-test-listings] total=${all.length} purge=${targets.length} keep=${keep} dryRun=${dryRun}`
    );
    for (const row of targets.slice(0, 40)) {
      console.log(
        `  - ${row.id} | ${row.seller_id} | ${String(row.title).slice(0, 60)}`
      );
    }
    if (targets.length > 40) {
      console.log(`  … +${targets.length - 40} more`);
    }

    if (!targets.length) {
      console.log("[purge-ai-test-listings] nothing to delete");
      return;
    }

    if (dryRun) {
      console.log("[purge-ai-test-listings] dry-run complete — no writes");
      return;
    }

    const ids = targets.map((t) => t.id);

    await client.query("BEGIN");

    // Unlink dependent rows that reference listings
    const dependents = [
      "saved_listings",
      "listing_views",
      "listing_analytics",
      "chat_threads",
      "chats",
      "offers",
      "reports",
      "support_reports",
      "wishlist_matches",
      "listing_embeddings",
      "image_embeddings",
    ];
    for (const table of dependents) {
      if (!(await tableExists(client, table))) continue;
      if (await columnExists(client, table, "listing_id")) {
        const res = await client.query(
          `DELETE FROM ${table} WHERE listing_id = ANY($1::text[])`,
          [ids]
        );
        console.log(
          `[purge] ${table}: removed ${res.rowCount ?? 0} row(s)`
        );
      }
    }

    // Clear temporary image refs + search vectors before delete
    if (await columnExists(client, "listings", "search_embedding")) {
      await client.query(
        `UPDATE listings
         SET search_embedding = NULL,
             embedding_updated_at = NULL
         WHERE id = ANY($1::text[])`,
        [ids]
      );
      console.log(`[purge] listings: cleared search_embedding on ${ids.length}`);
    }
    if (await columnExists(client, "listings", "image")) {
      await client.query(
        `UPDATE listings SET image = NULL WHERE id = ANY($1::text[])`,
        [ids]
      );
      console.log(`[purge] listings: cleared image on ${ids.length}`);
    }
    if (await columnExists(client, "listings", "images")) {
      const { rows: typeRows } = await client.query(
        `SELECT data_type, udt_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'listings'
           AND column_name = 'images'`
      );
      const dataType = String(typeRows[0]?.data_type ?? "");
      const udt = String(typeRows[0]?.udt_name ?? "");
      if (dataType === "ARRAY" || udt.startsWith("_")) {
        await client.query(
          `UPDATE listings SET images = '{}'::text[] WHERE id = ANY($1::text[])`,
          [ids]
        );
      } else if (udt === "jsonb" || dataType === "jsonb") {
        await client.query(
          `UPDATE listings SET images = '[]'::jsonb WHERE id = ANY($1::text[])`,
          [ids]
        );
      } else if (udt === "json" || dataType === "json") {
        await client.query(
          `UPDATE listings SET images = '[]'::json WHERE id = ANY($1::text[])`,
          [ids]
        );
      } else {
        await client.query(
          `UPDATE listings SET images = NULL WHERE id = ANY($1::text[])`,
          [ids]
        );
      }
      console.log(`[purge] listings: unlinked images on ${ids.length}`);
    }

    const del = await client.query(
      `DELETE FROM listings WHERE id = ANY($1::text[])`,
      [ids]
    );
    console.log(`[purge] listings: deleted ${del.rowCount ?? 0} row(s)`);

    await client.query("COMMIT");

    const { rows: after } = await client.query(
      `SELECT COUNT(*)::int AS c FROM listings`
    );
    const { rows: bySeller } = await client.query(
      `SELECT seller_id, COUNT(*)::int AS c
       FROM listings
       GROUP BY seller_id
       ORDER BY c DESC
       LIMIT 15`
    );

    console.log(`[purge] listings remaining: ${after[0]?.c ?? 0}`);
    console.log("[purge] counts by seller_id (top):");
    for (const row of bySeller) {
      console.log(`  ${row.seller_id}: ${row.c}`);
    }
    console.log("[purge-ai-test-listings] done");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[purge-ai-test-listings] FAILED:", err.message || err);
  process.exit(1);
});
