#!/usr/bin/env node
/**
 * FULL CLEAN SLATE — delete ALL listings + listing-linked dependents.
 *
 * Usage:
 *   DATABASE_URL=... node server/scripts/purge-all-listings.mjs
 *   DATABASE_URL=... node server/scripts/purge-all-listings.mjs --dry-run
 *
 * Via GH Actions: workflow "Purge ALL listings" (requires RENDER_API_KEY).
 *
 * Does NOT delete users, wallets, or billing — only listing catalog + leftovers.
 */
import "dotenv/config";
import pg from "pg";

const dryRun = process.argv.includes("--dry-run");
const confirmAll =
  process.argv.includes("--confirm-all") ||
  process.env.PURGE_ALL_LISTINGS === "1" ||
  process.env.PURGE_ALL_LISTINGS === "true";

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

if (!dryRun && !confirmAll && !isLocal) {
  console.error(
    "[purge-all-listings] Refusing live wipe without --confirm-all or PURGE_ALL_LISTINGS=1"
  );
  process.exit(2);
}

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

/** Tables with listing_id FK-style columns — wipe rows for purged listing ids. */
const LISTING_ID_DEPENDENTS = [
  "saved_listings",
  "listing_views",
  "listing_analytics",
  "listing_media",
  "listing_events",
  "chat_threads",
  "chats",
  "offers",
  "reports",
  "support_reports",
  "wishlist_matches",
  "listing_embeddings",
  "image_embeddings",
  "escrow_transactions",
  "promote_orders",
];

/** Extra leftovers that may reference listings by other column names / or orphan search. */
const EXTRA_PURGE = [
  { table: "user_search_history", mode: "truncate_if_exists" },
  { table: "search_history", mode: "truncate_if_exists" },
  { table: "recent_searches", mode: "truncate_if_exists" },
  { table: "user_searches", mode: "truncate_if_exists" },
];

async function main() {
  const client = await pool.connect();
  try {
    const { rows: before } = await client.query(
      `SELECT COUNT(*)::int AS c FROM listings`
    );
    const total = before[0]?.c ?? 0;
    console.log(`[purge-all-listings] dryRun=${dryRun} listings_before=${total}`);

    const { rows: sample } = await client.query(
      `SELECT id, seller_id, title, status
       FROM listings
       ORDER BY created_at DESC NULLS LAST
       LIMIT 25`
    );
    for (const row of sample) {
      console.log(
        `  - ${row.id} | ${row.seller_id} | ${row.status ?? "active"} | ${(row.title || "").slice(0, 60)}`
      );
    }
    if (total > sample.length) {
      console.log(`  … +${total - sample.length} more`);
    }

    if (dryRun) {
      console.log("[purge-all-listings] dry-run complete — no writes");
      return;
    }

    if (total === 0) {
      console.log("[purge-all-listings] already empty — still scrubbing dependents");
    }

    await client.query("BEGIN");

    const { rows: idRows } = await client.query(`SELECT id FROM listings`);
    const ids = idRows.map((r) => r.id);

    const dependentsRemoved = {};

    if (ids.length) {
      for (const table of LISTING_ID_DEPENDENTS) {
        if (!(await tableExists(client, table))) continue;
        if (!(await columnExists(client, table, "listing_id"))) continue;
        const res = await client.query(
          `DELETE FROM ${table} WHERE listing_id = ANY($1::text[])`,
          [ids]
        );
        dependentsRemoved[table] = res.rowCount ?? 0;
        console.log(`[purge] ${table}: removed ${res.rowCount ?? 0}`);
      }
    }

    // Also clear ALL saved_listings / listing_events leftovers (orphans)
    for (const table of [
      "saved_listings",
      "listing_views",
      "listing_analytics",
      "listing_media",
      "listing_events",
      "wishlist_matches",
    ]) {
      if (!(await tableExists(client, table))) continue;
      const res = await client.query(`DELETE FROM ${table}`);
      const n = res.rowCount ?? 0;
      if (n > 0) {
        dependentsRemoved[`${table}_full`] = n;
        console.log(`[purge] ${table}: full wipe ${n}`);
      }
    }

    for (const extra of EXTRA_PURGE) {
      if (!(await tableExists(client, extra.table))) continue;
      const res = await client.query(`DELETE FROM ${extra.table}`);
      dependentsRemoved[extra.table] = res.rowCount ?? 0;
      console.log(`[purge] ${extra.table}: removed ${res.rowCount ?? 0}`);
    }

    // Chat leftovers: threads/messages that still point at missing listings
    if (await tableExists(client, "chats")) {
      if (await columnExists(client, "chats", "listing_id")) {
        const res = await client.query(
          `DELETE FROM chats
           WHERE listing_id IS NOT NULL
             AND listing_id NOT IN (SELECT id FROM listings)`
        );
        dependentsRemoved.chats_orphan = res.rowCount ?? 0;
        console.log(`[purge] chats orphans: ${res.rowCount ?? 0}`);
      }
    }
    if (await tableExists(client, "chat_threads")) {
      if (await columnExists(client, "chat_threads", "listing_id")) {
        const res = await client.query(
          `DELETE FROM chat_threads
           WHERE listing_id IS NOT NULL
             AND listing_id NOT IN (SELECT id FROM listings)`
        );
        dependentsRemoved.chat_threads_orphan = res.rowCount ?? 0;
        console.log(`[purge] chat_threads orphans: ${res.rowCount ?? 0}`);
      }
    }

    const del = await client.query(`DELETE FROM listings`);
    dependentsRemoved.listings = del.rowCount ?? 0;
    console.log(`[purge] listings: deleted ${del.rowCount ?? 0}`);

    await client.query("COMMIT");

    const { rows: after } = await client.query(
      `SELECT COUNT(*)::int AS c FROM listings`
    );
    let savedRemaining = 0;
    if (await tableExists(client, "saved_listings")) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS c FROM saved_listings`
      );
      savedRemaining = rows[0]?.c ?? 0;
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: false,
          purged: dependentsRemoved.listings ?? 0,
          listingsRemaining: after[0]?.c ?? 0,
          savedListingsRemaining: savedRemaining,
          dependentsRemoved,
        },
        null,
        2
      )
    );

    if ((after[0]?.c ?? 0) !== 0) {
      throw new Error(`Expected 0 listings, got ${after[0]?.c}`);
    }
    console.log("[purge-all-listings] DONE — catalog is empty");
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
  console.error("[purge-all-listings] FAILED:", err.message || err);
  process.exit(1);
});
