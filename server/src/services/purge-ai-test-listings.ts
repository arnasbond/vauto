import { pool } from "../db.js";

const DEMO_ID_RE = /^(lt-|demo-|seller-)/i;

const AI_ATTR_KEYS = [
  "sellIntentActive",
  "salesCopyGenerated",
  "deferredSalesDescription",
  "clientDraftId",
  "visionQuotaFallback",
  "awaitingSpecs",
  "_vautoCategory",
] as const;

export interface PurgeAiTestListingsOptions {
  dryRun?: boolean;
}

export interface PurgeAiTestListingsResult {
  ok: boolean;
  dryRun: boolean;
  total: number;
  purged: number;
  kept: number;
  deletedIds: string[];
  sample: Array<{ id: string; sellerId: string; title: string }>;
  dependentsRemoved: Record<string, number>;
  listingsRemaining: number;
  bySeller: Array<{ sellerId: string; count: number }>;
  note: string;
}

type ListingRow = {
  id: string;
  seller_id: string | null;
  title: string | null;
  attributes: unknown;
};

function parseAttrs(raw: unknown): Record<string, unknown> {
  let attrs = raw;
  if (typeof attrs === "string") {
    try {
      attrs = JSON.parse(attrs);
    } catch {
      attrs = {};
    }
  }
  return attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>) : {};
}

export function isAiTestListing(row: ListingRow): boolean {
  if (DEMO_ID_RE.test(row.id)) return false;
  if (String(row.seller_id ?? "").startsWith("seller-")) return false;

  const attrs = parseAttrs(row.attributes);
  for (const key of AI_ATTR_KEYS) {
    const val = attrs[key];
    if (val != null && String(val).trim() !== "") return true;
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      row.id
    )
  ) {
    return true;
  }
  if (/^l-[0-9a-f-]{8,}/i.test(row.id)) return true;
  if (/^(listing-|lst-|ai-|cd-|pub-)/i.test(row.id)) return true;

  const title = String(row.title ?? "").trim();
  if (
    /^(naujas skelbimas|parduodamas?\s+\w{0,24}|paveikslas|prekė|preke|drabužių skelbimas)$/i.test(
      title
    )
  ) {
    return true;
  }

  return false;
}

async function tableExists(client: { query: typeof pool.query }, name: string) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return rows.length > 0;
}

async function columnExists(
  client: { query: typeof pool.query },
  table: string,
  column: string
) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

/**
 * Delete AI-generated / temporary test listings. Keeps seeded demo catalog
 * (`lt-*`, `seller-*`). Clears dependent rows and embedding side-tables.
 * Active listing counts ("Mano skelbimai") are derived from listings rows.
 */
export async function purgeAiTestListings(
  options: PurgeAiTestListingsOptions = {}
): Promise<PurgeAiTestListingsResult> {
  const dryRun = options.dryRun === true;
  const client = await pool.connect();

  try {
    const { rows: all } = await client.query<ListingRow>(
      `SELECT id, seller_id, title, attributes FROM listings
       ORDER BY created_at DESC NULLS LAST`
    );

    const targets = all.filter(isAiTestListing);
    const sample = targets.slice(0, 40).map((row) => ({
      id: row.id,
      sellerId: String(row.seller_id ?? ""),
      title: String(row.title ?? "").slice(0, 80),
    }));

    if (!targets.length || dryRun) {
      const { rows: after } = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM listings`
      );
      const { rows: bySeller } = await client.query<{
        seller_id: string;
        c: number;
      }>(
        `SELECT seller_id, COUNT(*)::int AS c
         FROM listings
         GROUP BY seller_id
         ORDER BY c DESC
         LIMIT 15`
      );

      return {
        ok: true,
        dryRun,
        total: all.length,
        purged: dryRun ? targets.length : 0,
        kept: all.length - (dryRun ? 0 : targets.length),
        deletedIds: dryRun ? targets.map((t) => t.id) : [],
        sample,
        dependentsRemoved: {},
        listingsRemaining: after[0]?.c ?? all.length,
        bySeller: bySeller.map((r) => ({
          sellerId: r.seller_id,
          count: r.c,
        })),
        note: dryRun
          ? "Dry run only — no rows deleted."
          : "Nothing to delete.",
      };
    }

    const ids = targets.map((t) => t.id);
    const dependentsRemoved: Record<string, number> = {};

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
      dependentsRemoved[table] = res.rowCount ?? 0;
    }

    // Clear vectors; image columns may be NOT NULL — DELETE unlinks image refs with the row
    if (await columnExists(client, "listings", "search_embedding")) {
      await client.query(
        `UPDATE listings
         SET search_embedding = NULL,
             embedding_updated_at = NULL
         WHERE id = ANY($1::text[])`,
        [ids]
      );
    }

    const del = await client.query(
      `DELETE FROM listings WHERE id = ANY($1::text[])`,
      [ids]
    );
    dependentsRemoved.listings = del.rowCount ?? 0;

    await client.query("COMMIT");

    const { rows: after } = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM listings`
    );
    const { rows: bySeller } = await client.query<{
      seller_id: string;
      c: number;
    }>(
      `SELECT seller_id, COUNT(*)::int AS c
       FROM listings
       GROUP BY seller_id
       ORDER BY c DESC
       LIMIT 15`
    );

    return {
      ok: true,
      dryRun: false,
      total: all.length,
      purged: del.rowCount ?? ids.length,
      kept: all.length - (del.rowCount ?? ids.length),
      deletedIds: ids,
      sample,
      dependentsRemoved,
      listingsRemaining: after[0]?.c ?? 0,
      bySeller: bySeller.map((r) => ({
        sellerId: r.seller_id,
        count: r.c,
      })),
      note: "AI/test listings purged; demo catalog kept. Seller active counts derive from remaining rows.",
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}
