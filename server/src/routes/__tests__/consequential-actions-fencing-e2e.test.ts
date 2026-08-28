/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 * 3rd audit remediation, requirement #4 — the EXACT slow-but-alive executor
 * scenario, end-to-end through the REAL `executeMarkListingSold` /
 * `executeBlockListing` functions AND the REAL atomic domain operations
 * (atomic-listing-ops.ts) against a real PGlite engine:
 *
 *   1. First executor acquires the lease and pauses BEYOND the lease
 *      duration (simulated here by gating its call into the atomic op —
 *      it is genuinely "still alive", just slow).
 *   2. A second caller atomically reclaims the row with a DIFFERENT
 *      fencing token and runs to completion.
 *   3. Both executors are released in adversarial order (the ORIGINAL,
 *      slow one is released LAST, after the reclaimer has already
 *      finished).
 *
 * Asserts: the old token cannot terminalize; exactly one authoritative
 * terminal result remains and is observed by BOTH callers; sold_count
 * increments exactly once; the block notification fires exactly once; a
 * later replay call receives the same defined terminal outcome.
 */

import assert from "node:assert/strict";
import { describe, it, before, after, afterEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Queryable } from "../../transaction/tx-connection.js";
import {
  confirmConsequentialAction,
  createInMemoryPendingActionStore,
  proposeConsequentialAction,
  CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS,
} from "../../ai/confirmation/consequential-action-policy.js";
import {
  setConsequentialActionRepoOpsForTests,
  type ConsequentialActionRepoOps,
} from "../consequential-actions.js";
import { markListingSoldAtomic, setListingBannedAtomic } from "../../ai/confirmation/atomic-listing-ops.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import type { ApiListing } from "../../types.js";

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

function fakeListing(overrides: Partial<ApiListing> = {}): ApiListing {
  return {
    id: "listing-1",
    sellerId: "user-1",
    title: "BMW 320d",
    price: 8000,
    location: "Vilnius",
    distanceKm: 0,
    image: "",
    images: [],
    category: "vehicles",
    tags: [],
    createdAt: new Date().toISOString(),
    contact: "",
    description: "",
    status: "active",
    banned: false,
    ...overrides,
  };
}

async function importExecutors(): Promise<{
  markListingSold: (targetId: string, authUserId: string) => Promise<unknown>;
  blockListing: (req: AuthedRequest, targetId: string) => Promise<unknown>;
}> {
  const mod = (await import("../consequential-actions.js")) as unknown as {
    __executeMarkListingSoldForTests?: (targetId: string, authUserId: string) => Promise<unknown>;
    __executeBlockListingForTests?: (req: AuthedRequest, targetId: string) => Promise<unknown>;
  };
  if (!mod.__executeMarkListingSoldForTests || !mod.__executeBlockListingForTests) {
    throw new Error("consequential-actions.js must export the ForTests executors");
  }
  return {
    markListingSold: mod.__executeMarkListingSoldForTests,
    blockListing: mod.__executeBlockListingForTests,
  };
}

describe("3rd audit — AUDIT #4: the exact slow-but-alive executor scenario (real executors + real atomic ops)", () => {
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

  afterEach(() => {
    setConsequentialActionRepoOpsForTests(null);
  });

  it("markListingSold: old token cannot terminalize; one authoritative result; sold_count increments exactly once; replay matches", async () => {
    await db.exec("DELETE FROM listings; DELETE FROM users;");
    await q.query(
      `INSERT INTO listings (id, seller_id, title, status, banned) VALUES ($1,$2,$3,'active',false)`,
      ["listing-1", "user-1", "BMW 320d"]
    );
    await q.query(`INSERT INTO users (id, sold_count) VALUES ($1, 0)`, ["user-1"]);

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let atomicOpCalls = 0;
    const ops: ConsequentialActionRepoOps = {
      markListingSoldAtomic: async (listingId, sellerId) => {
        atomicOpCalls += 1;
        if (atomicOpCalls === 1) {
          // The FIRST call is the ORIGINAL (slow-but-alive) executor —
          // block it here, BEFORE it reaches the real atomic op, so the
          // reclaiming second call's real atomic op genuinely runs first.
          await gate;
        }
        return markListingSoldAtomic(q, listingId, sellerId);
      },
      setListingBannedAtomic: async () => null,
      getListingForEmbedding: async () => null,
      userIsAdmin: async () => false,
      notifySellerListingRejected: async () => {},
    };
    setConsequentialActionRepoOpsForTests(ops);

    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "user-1",
      type: "markListingSold" as const,
      targetId: "listing-1",
    };
    const { markListingSold } = await importExecutors();
    const now = Date.now();

    // 1. First executor acquires the lease and pauses beyond the lease duration.
    const firstConfirm = confirmConsequentialAction(
      store,
      confirmParams,
      (action) => markListingSold(action.targetId, "user-1"),
      { now }
    );
    await new Promise((r) => setTimeout(r, 15));

    // 2. Second caller atomically reclaims with a DIFFERENT fencing token
    //    and runs to completion.
    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const secondOutcome = await confirmConsequentialAction(
      store,
      confirmParams,
      (action) => markListingSold(action.targetId, "user-1"),
      { now: staleNow }
    );
    assert.equal(secondOutcome.ok, true);

    // Row is already terminal via the NEW owner before the old one is released.
    const midRow = await store.get(pending.id);
    assert.equal(midRow?.state, "SUCCEEDED");

    // 3. Release both executors in adversarial order — the ORIGINAL, slow
    //    one is released LAST.
    release();
    const firstOutcome = await firstConfirm;

    assert.equal(firstOutcome.ok, true);
    if (firstOutcome.ok && secondOutcome.ok) {
      // The old token cannot terminalize; one authoritative terminal
      // result remains, and the fenced-out original observes it (never
      // fabricates its own).
      assert.deepEqual(firstOutcome.result, secondOutcome.result);
    }

    const listingRow = (
      await q.query<{ status: string }>(`SELECT status FROM listings WHERE id = $1`, ["listing-1"])
    ).rows[0];
    assert.equal(listingRow.status, "sold");
    const userRow = (
      await q.query<{ sold_count: number }>(`SELECT sold_count FROM users WHERE id = $1`, ["user-1"])
    ).rows[0];
    assert.equal(Number(userRow.sold_count), 1, "sold_count must increment exactly once despite the overlap");

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");

    // All replay callers receive the same defined terminal outcome.
    const replayOutcome = await confirmConsequentialAction(
      store,
      confirmParams,
      (action) => markListingSold(action.targetId, "user-1"),
      { now: staleNow + 5000 }
    );
    assert.equal(replayOutcome.ok, true);
    if (replayOutcome.ok && firstOutcome.ok) {
      assert.deepEqual(replayOutcome.result, firstOutcome.result);
    }
    const userRowAfterReplay = (
      await q.query<{ sold_count: number }>(`SELECT sold_count FROM users WHERE id = $1`, ["user-1"])
    ).rows[0];
    assert.equal(Number(userRowAfterReplay.sold_count), 1, "replay must never increment sold_count again");
  });

  it("blockListing: old token cannot terminalize; one authoritative result; moderation notification fires exactly once; replay matches", async () => {
    await db.exec("DELETE FROM listings; DELETE FROM users;");
    await q.query(
      `INSERT INTO listings (id, seller_id, title, status, banned) VALUES ($1,$2,$3,'active',false)`,
      ["listing-1", "user-1", "Suspicious listing"]
    );

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let atomicOpCalls = 0;
    let notifyCalls = 0;
    const ops: ConsequentialActionRepoOps = {
      markListingSoldAtomic: async () => null,
      setListingBannedAtomic: async (listingId) => {
        atomicOpCalls += 1;
        if (atomicOpCalls === 1) {
          await gate;
        }
        return setListingBannedAtomic(q, listingId);
      },
      getListingForEmbedding: async () => fakeListing({ banned: true }),
      userIsAdmin: async () => true,
      notifySellerListingRejected: async () => {
        notifyCalls += 1;
      },
    };
    setConsequentialActionRepoOpsForTests(ops);

    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "listing-1",
      userId: "admin-1",
      explanation: "explain",
    });
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "admin-1",
      type: "blockListing" as const,
      targetId: "listing-1",
    };
    const { blockListing } = await importExecutors();
    const fakeReq = { authUserId: "admin-1", authRole: "admin" } as unknown as AuthedRequest;
    const now = Date.now();

    const firstConfirm = confirmConsequentialAction(
      store,
      confirmParams,
      (action) => blockListing(fakeReq, action.targetId),
      { now }
    );
    await new Promise((r) => setTimeout(r, 15));

    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const secondOutcome = await confirmConsequentialAction(
      store,
      confirmParams,
      (action) => blockListing(fakeReq, action.targetId),
      { now: staleNow }
    );
    assert.equal(secondOutcome.ok, true);
    assert.equal(notifyCalls, 1, "exactly one notification for the real transition");

    release();
    const firstOutcome = await firstConfirm;

    assert.equal(firstOutcome.ok, true);
    if (firstOutcome.ok && secondOutcome.ok) {
      assert.deepEqual(firstOutcome.result, secondOutcome.result);
    }
    assert.equal(notifyCalls, 1, "the fenced-out original executor must never trigger a duplicate notification");

    const listingRow = (
      await q.query<{ banned: boolean }>(`SELECT banned FROM listings WHERE id = $1`, ["listing-1"])
    ).rows[0];
    assert.equal(listingRow.banned, true);

    const replayOutcome = await confirmConsequentialAction(
      store,
      confirmParams,
      (action) => blockListing(fakeReq, action.targetId),
      { now: staleNow + 5000 }
    );
    assert.equal(replayOutcome.ok, true);
    if (replayOutcome.ok && firstOutcome.ok) {
      assert.deepEqual(replayOutcome.result, firstOutcome.result);
    }
    assert.equal(notifyCalls, 1, "replay must never notify again");
  });
});
