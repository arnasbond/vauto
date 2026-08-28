/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 * 3rd audit remediation — proves `markListingSoldAtomic` /
 * `setListingBannedAtomic` (atomic-listing-ops.ts) are genuinely atomic
 * idempotent domain operations against a REAL PostgreSQL-compatible engine
 * (PGlite), not just in-memory fakes:
 *
 *  - Two overlapping `markListingSoldAtomic` calls for the SAME listing
 *    leave status 'sold', increment users.sold_count exactly ONCE, and both
 *    callers receive a safe, deterministic outcome (exactly one
 *    alreadyDone:false, exactly one alreadyDone:true).
 *  - Two overlapping `setListingBannedAtomic` calls leave banned=true with
 *    exactly one alreadyDone:false winner — the ONLY caller allowed to
 *    enqueue/send the moderation notification (proven in
 *    routes/__tests__/consequential-actions-recovery.test.ts for the
 *    executor-level notify-once wiring; this file proves the underlying
 *    atomic primitive itself never lets two callers see alreadyDone:false).
 */

import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Queryable } from "../../../transaction/tx-connection.js";
import { markListingSoldAtomic, setListingBannedAtomic } from "../atomic-listing-ops.js";

function adaptPglite(db: PGlite): Queryable {
  return {
    async query(text, params = []) {
      try {
        const res = await db.query(text, params as never[]);
        return {
          rows: (res.rows ?? []) as never[],
          rowCount: res.affectedRows ?? null,
        };
      } catch (e) {
        try {
          await db.exec("ROLLBACK");
        } catch {
          /* session already idle */
        }
        throw e;
      }
    },
  };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  banned BOOLEAN DEFAULT false
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  sold_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ
);
`;

describe("3rd audit — atomic-listing-ops against a REAL PGlite engine", () => {
  let db: PGlite;
  let q: Queryable;

  before(async () => {
    db = new PGlite();
    await db.exec(SCHEMA_SQL);
    q = adaptPglite(db);
  });

  after(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM listings; DELETE FROM users;");
  });

  async function seed(listingId: string, sellerId: string, opts: { status?: string; banned?: boolean } = {}) {
    await q.query(
      `INSERT INTO listings (id, seller_id, title, status, banned) VALUES ($1, $2, $3, $4, $5)`,
      [listingId, sellerId, "BMW 320d", opts.status ?? "active", opts.banned ?? false]
    );
    await q.query(`INSERT INTO users (id, sold_count) VALUES ($1, 0)`, [sellerId]);
  }

  describe("markListingSoldAtomic", () => {
    it("transitions active -> sold and increments sold_count exactly once for a single call", async () => {
      await seed("listing-1", "seller-1");
      const result = await markListingSoldAtomic(q, "listing-1", "seller-1");
      assert.ok(result);
      assert.equal(result?.alreadyDone, false);
      assert.equal(result?.title, "BMW 320d");

      const listingRow = (await q.query<{ status: string }>(`SELECT status FROM listings WHERE id = $1`, ["listing-1"])).rows[0];
      assert.equal(listingRow.status, "sold");
      const userRow = (await q.query<{ sold_count: number }>(`SELECT sold_count FROM users WHERE id = $1`, ["seller-1"])).rows[0];
      assert.equal(Number(userRow.sold_count), 1);
    });

    it("replay: calling again on an already-sold listing by the SAME owner returns alreadyDone:true with NO further increment", async () => {
      await seed("listing-1", "seller-1", { status: "sold" });
      await q.query(`UPDATE users SET sold_count = 1 WHERE id = $1`, ["seller-1"]);

      const result = await markListingSoldAtomic(q, "listing-1", "seller-1");
      assert.ok(result);
      assert.equal(result?.alreadyDone, true);

      const userRow = (await q.query<{ sold_count: number }>(`SELECT sold_count FROM users WHERE id = $1`, ["seller-1"])).rows[0];
      assert.equal(Number(userRow.sold_count), 1, "must never increment again on replay");
    });

    it("ownership mismatch: a different seller_id returns null, never mutates", async () => {
      await seed("listing-1", "seller-1");
      const result = await markListingSoldAtomic(q, "listing-1", "attacker");
      assert.equal(result, null);

      const listingRow = (await q.query<{ status: string }>(`SELECT status FROM listings WHERE id = $1`, ["listing-1"])).rows[0];
      assert.equal(listingRow.status, "active");
    });

    it("not found: returns null", async () => {
      const result = await markListingSoldAtomic(q, "missing", "seller-1");
      assert.equal(result, null);
    });

    it("AUDIT — two overlapping calls for the SAME listing: status sold, sold_count incremented EXACTLY once, both callers get a safe deterministic outcome", async () => {
      await seed("listing-1", "seller-1");

      const [a, b] = await Promise.all([
        markListingSoldAtomic(q, "listing-1", "seller-1"),
        markListingSoldAtomic(q, "listing-1", "seller-1"),
      ]);

      assert.ok(a && b, "both callers must receive a defined, non-null outcome");
      const alreadyDoneFlags = [a!.alreadyDone, b!.alreadyDone].sort();
      assert.deepEqual(
        alreadyDoneFlags,
        [false, true],
        "exactly one caller performed the real transition, the other observed it already done"
      );

      const listingRow = (await q.query<{ status: string }>(`SELECT status FROM listings WHERE id = $1`, ["listing-1"])).rows[0];
      assert.equal(listingRow.status, "sold");
      const userRow = (await q.query<{ sold_count: number }>(`SELECT sold_count FROM users WHERE id = $1`, ["seller-1"])).rows[0];
      assert.equal(Number(userRow.sold_count), 1, "sold_count must be incremented EXACTLY once, never twice");
    });

    it("AUDIT — many overlapping calls (10x) for the SAME listing still increment sold_count exactly once", async () => {
      await seed("listing-1", "seller-1");

      const results = await Promise.all(
        Array.from({ length: 10 }, () => markListingSoldAtomic(q, "listing-1", "seller-1"))
      );
      assert.equal(results.filter((r) => r?.alreadyDone === false).length, 1, "exactly one real transition");
      assert.equal(results.filter((r) => r?.alreadyDone === true).length, 9);

      const userRow = (await q.query<{ sold_count: number }>(`SELECT sold_count FROM users WHERE id = $1`, ["seller-1"])).rows[0];
      assert.equal(Number(userRow.sold_count), 1);
    });
  });

  describe("setListingBannedAtomic", () => {
    it("transitions banned false -> true for a single call", async () => {
      await seed("listing-1", "seller-1");
      const result = await setListingBannedAtomic(q, "listing-1");
      assert.ok(result);
      assert.equal(result?.alreadyDone, false);

      const listingRow = (await q.query<{ banned: boolean }>(`SELECT banned FROM listings WHERE id = $1`, ["listing-1"])).rows[0];
      assert.equal(listingRow.banned, true);
    });

    it("replay: calling again on an already-banned listing returns alreadyDone:true", async () => {
      await seed("listing-1", "seller-1", { banned: true });
      const result = await setListingBannedAtomic(q, "listing-1");
      assert.ok(result);
      assert.equal(result?.alreadyDone, true);
    });

    it("not found: returns null", async () => {
      const result = await setListingBannedAtomic(q, "missing");
      assert.equal(result, null);
    });

    it("AUDIT — two overlapping calls for the SAME listing produce exactly ONE alreadyDone:false winner (the only caller allowed to notify)", async () => {
      await seed("listing-1", "seller-1");

      const [a, b] = await Promise.all([
        setListingBannedAtomic(q, "listing-1"),
        setListingBannedAtomic(q, "listing-1"),
      ]);

      assert.ok(a && b);
      const alreadyDoneFlags = [a!.alreadyDone, b!.alreadyDone].sort();
      assert.deepEqual(alreadyDoneFlags, [false, true]);

      const listingRow = (await q.query<{ banned: boolean }>(`SELECT banned FROM listings WHERE id = $1`, ["listing-1"])).rows[0];
      assert.equal(listingRow.banned, true);
    });

    it("AUDIT — many overlapping calls (10x) for the SAME listing still produce exactly ONE alreadyDone:false winner", async () => {
      await seed("listing-1", "seller-1");

      const results = await Promise.all(
        Array.from({ length: 10 }, () => setListingBannedAtomic(q, "listing-1"))
      );
      assert.equal(results.filter((r) => r?.alreadyDone === false).length, 1);
      assert.equal(results.filter((r) => r?.alreadyDone === true).length, 9);
    });
  });
});
