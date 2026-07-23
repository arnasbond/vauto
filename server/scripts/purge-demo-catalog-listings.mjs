#!/usr/bin/env node
/**
 * Purge default mock/demo catalog listings from Postgres.
 * Targets ids/sellers: lt-*, demo-*, seller-* (the seeded catalog).
 * Leaves live user listings (l-<uuid>, real user-* sellers) intact.
 *
 * Usage (from repo root or server/):
 *   node server/scripts/purge-demo-catalog-listings.mjs
 *   node server/scripts/purge-demo-catalog-listings.mjs --dry-run
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

const DEMO_ID_RE = /^(lt-|demo-|seller-)/i;

const pool = new pg.Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

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

function isDemoCatalogListing(row) {
  if (DEMO_ID_RE.test(String(row.id ?? ""))) return true;
  if (String(row.seller_id ?? "").startsWith("seller-")) return true;
  return false;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: all } = await client.query(
      `SELECT id, seller_id, title, category, status, created_at
       FROM listings
       ORDER BY created_at DESC NULLS LAST`
    );

    const targets = all.filter(isDemoCatalogListing);
    const keep = all.length - targets.length;

    console.log(
      `[purge-demo-catalog] total=${all.length} purge=${targets.length} keep=${keep} dryRun=${dryRun}`
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
      console.log("[purge-demo-catalog] nothing to delete");
      return;
    }

    if (dryRun) {
      console.log("[purge-demo-catalog] dry-run complete — no writes");
      return;
    }

    const ids = targets.map((t) => t.id);

    await client.query("BEGIN");

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
      if (!(await columnExists(client, table, "listing_id"))) continue;
      const res = await client.query(
        `DELETE FROM ${table} WHERE listing_id = ANY($1::text[])`,
        [ids]
      );
      console.log(`[purge] ${table}: removed ${res.rowCount ?? 0} row(s)`);
    }

    if (await columnExists(client, "listings", "search_embedding")) {
      await client.query(
        `UPDATE listings
         SET search_embedding = NULL,
             embedding_updated_at = NULL
         WHERE id = ANY($1::text[])`,
        [ids]
      );
      console.log(
        `[purge] listings: cleared search_embedding on ${ids.length}`
      );
    }

    const del = await client.query(
      `DELETE FROM listings WHERE id = ANY($1::text[])`,
      [ids]
    );
    console.log(`[purge] listings: deleted ${del.rowCount ?? 0} demo row(s)`);

    // Optional: remove orphan demo seller users (never delete real user-* / admin)
    if (await tableExists(client, "users")) {
      const demoSellers = [
        ...new Set(
          targets
            .map((t) => String(t.seller_id ?? ""))
            .filter((id) => /^seller-/i.test(id) || id === "demo-user")
        ),
      ];
      if (demoSellers.length) {
        const u = await client.query(
          `DELETE FROM users
           WHERE id = ANY($1::text[])
             AND id NOT LIKE 'user-%'
             AND id <> 'admin-1'`,
          [demoSellers]
        );
        console.log(
          `[purge] demo seller users: deleted ${u.rowCount ?? 0} row(s)`
        );
      }
    }

    await client.query("COMMIT");

    const { rows: after } = await client.query(
      `SELECT COUNT(*)::int AS c FROM listings`
    );
    const { rows: demoLeft } = await client.query(
      `SELECT COUNT(*)::int AS c FROM listings
       WHERE id ~* '^(lt-|demo-|seller-)'
          OR seller_id LIKE 'seller-%'`
    );
    const { rows: bySeller } = await client.query(
      `SELECT seller_id, COUNT(*)::int AS c
       FROM listings
       GROUP BY seller_id
       ORDER BY c DESC
       LIMIT 15`
    );

    console.log(`[purge] listings remaining: ${after[0]?.c ?? 0}`);
    console.log(`[purge] demo-pattern remaining: ${demoLeft[0]?.c ?? 0}`);
    console.log("[purge] counts by seller_id (top):");
    for (const row of bySeller) {
      console.log(`  ${row.seller_id}: ${row.c}`);
    }
    console.log("[purge-demo-catalog] done");
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
  console.error("[purge-demo-catalog] FAILED:", err.message || err);
  process.exit(1);
});
