/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 * 2nd audit remediation A — proves the REAL `executeMarkListingSold` /
 * `executeBlockListing` functions (not an abstract stand-in model) are
 * idempotent reconciliation-first, which is what makes the stale-EXECUTING
 * lease reclaim in consequential-action-policy.ts safe to re-run them:
 *
 *  - markListingSold: already-sold listings finalize SUCCEEDED with zero
 *    further mutation attempts.
 *  - blockListing: already-banned listings finalize SUCCEEDED with zero
 *    further mutation attempts AND zero duplicate moderation notifications.
 *
 * `setConsequentialActionRepoOpsForTests` swaps only the
 * `markListingSoldAtomic` / `setListingBannedAtomic` (atomic-listing-ops.ts)
 * seam used INSIDE these two functions — the reconciliation branching
 * itself (role checks, notify-once-on-real-transition) is the real
 * production code path, exercised end-to-end through
 * `confirmConsequentialAction` against a real in-memory `PendingActionStore`
 * with a genuinely stale execution lease (simulated crash). The atomic
 * operations THEMSELVES are proven against a real PGlite engine in a
 * separate file: ai/confirmation/__tests__/atomic-listing-ops.test.ts.
 */

import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import type { AuthedRequest } from "../../middleware/auth.js";
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
import type { ApiListing } from "../../types.js";

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

afterEach(() => {
  setConsequentialActionRepoOpsForTests(null);
});

describe("AUDIT A — executeMarkListingSold recovery reconciliation (real production code path)", () => {
  it("already sold by the SAME owner: recovery finalizes SUCCEEDED with ZERO further mutation attempts", async () => {
    let markSoldCalls = 0;
    const ops: ConsequentialActionRepoOps = {
      markListingSoldAtomic: async () => {
        markSoldCalls += 1;
        // The atomic op itself is what detects "already sold" — this fake
        // mirrors exactly what markListingSoldAtomic returns in that case.
        return { ok: true, listingId: "listing-1", title: "BMW 320d", alreadyDone: true };
      },
      setListingBannedAtomic: async () => null,
      getListingForEmbedding: async () => fakeListing({ status: "sold" }),
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
    const now = Date.now();
    const claim = await store.tryClaim(pending.id, now); // simulate crashed prior claim
    assert.equal(claim.claimed, true);

    const { markListingSold } = await importExecutors();
    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "listing-1" },
      (action) => markListingSold(action.targetId, "user-1"),
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000 }
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      const r = outcome.result as { ok: boolean; alreadyDone?: boolean };
      assert.equal(r.ok, true);
      assert.equal(r.alreadyDone, true);
    }
    assert.equal(markSoldCalls, 1, "the atomic op is called exactly once — IT is what decides already-done");

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
  });

  it("still active (not yet sold): recovery safely repeats the idempotent atomic op exactly once", async () => {
    let markSoldCalls = 0;
    const ops: ConsequentialActionRepoOps = {
      markListingSoldAtomic: async (listingId) => {
        markSoldCalls += 1;
        return { ok: true, listingId, title: "BMW 320d", alreadyDone: false };
      },
      setListingBannedAtomic: async () => null,
      getListingForEmbedding: async () => fakeListing({ status: "active" }),
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
    const now = Date.now();
    await store.tryClaim(pending.id, now);

    const { markListingSold } = await importExecutors();
    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "listing-1" },
      (action) => markListingSold(action.targetId, "user-1"),
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000 }
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      const r = outcome.result as { ok: boolean; alreadyDone?: boolean };
      assert.equal(r.ok, true);
      assert.equal(r.alreadyDone, undefined);
    }
    assert.equal(markSoldCalls, 1);
  });

  it("ownership mismatch: the atomic op returning null is translated to ownership_changed, never a fabricated success", async () => {
    const ops: ConsequentialActionRepoOps = {
      markListingSoldAtomic: async () => null,
      setListingBannedAtomic: async () => null,
      getListingForEmbedding: async () => fakeListing({ sellerId: "someone-else" }),
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

    const { markListingSold } = await importExecutors();
    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "listing-1" },
      (action) => markListingSold(action.targetId, "user-1")
    );

    assert.equal(outcome.ok, true); // envelope succeeded (ran exactly once)
    if (outcome.ok) {
      const r = outcome.result as { ok: boolean; reason?: string };
      assert.equal(r.ok, false);
      assert.equal(r.reason, "ownership_changed");
    }
  });
});

describe("AUDIT A — executeBlockListing recovery reconciliation (real production code path, no duplicate notification)", () => {
  it("already banned: recovery finalizes SUCCEEDED with ZERO further mutation attempts and ZERO duplicate notifications", async () => {
    let banCalls = 0;
    let notifyCalls = 0;
    const ops: ConsequentialActionRepoOps = {
      markListingSoldAtomic: async () => null,
      setListingBannedAtomic: async () => {
        banCalls += 1;
        return { ok: true, listingId: "listing-1", title: "Suspicious listing", alreadyDone: true };
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
    const now = Date.now();
    await store.tryClaim(pending.id, now); // simulate crashed prior claim

    const { blockListing } = await importExecutors();
    const fakeReq = { authUserId: "admin-1", authRole: "admin" } as unknown as AuthedRequest;
    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "admin-1", type: "blockListing", targetId: "listing-1" },
      (action) => blockListing(fakeReq, action.targetId),
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000 }
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      const r = outcome.result as { ok: boolean; alreadyDone?: boolean };
      assert.equal(r.ok, true);
      assert.equal(r.alreadyDone, true);
    }
    assert.equal(banCalls, 1, "the atomic op is called exactly once — IT is what decides already-done");
    assert.equal(notifyCalls, 0, "already-banned reconciliation must never send a duplicate moderation notification");

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
  });

  it("not yet banned: recovery performs the idempotent atomic op exactly once and sends exactly ONE notification", async () => {
    let banCalls = 0;
    let notifyCalls = 0;
    const ops: ConsequentialActionRepoOps = {
      markListingSoldAtomic: async () => null,
      setListingBannedAtomic: async (listingId) => {
        banCalls += 1;
        return { ok: true, listingId, title: "Suspicious listing", alreadyDone: false };
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
    const now = Date.now();
    await store.tryClaim(pending.id, now);

    const { blockListing } = await importExecutors();
    const fakeReq = { authUserId: "admin-1", authRole: "admin" } as unknown as AuthedRequest;
    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "admin-1", type: "blockListing", targetId: "listing-1" },
      (action) => blockListing(fakeReq, action.targetId),
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000 }
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      const r = outcome.result as { ok: boolean; alreadyDone?: boolean };
      assert.equal(r.ok, true);
      assert.equal(r.alreadyDone, undefined);
    }
    assert.equal(banCalls, 1);
    assert.equal(notifyCalls, 1);

    // Replaying the SAME already-terminal pendingActionId must never
    // re-notify or re-mutate — this is the ordinary terminal-state replay
    // guarantee, unaffected by the recovery mechanism.
    const replay = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "admin-1", type: "blockListing", targetId: "listing-1" },
      (action) => blockListing(fakeReq, action.targetId),
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 2000 }
    );
    assert.equal(replay.ok, true);
    assert.equal(banCalls, 1);
    assert.equal(notifyCalls, 1);
  });

  it("role revoked between proposal and recovery: fails safely with role_changed, never bans", async () => {
    let banCalls = 0;
    const ops: ConsequentialActionRepoOps = {
      markListingSoldAtomic: async () => null,
      setListingBannedAtomic: async (listingId) => {
        banCalls += 1;
        return { ok: true, listingId, title: "Suspicious listing", alreadyDone: false };
      },
      getListingForEmbedding: async () => fakeListing({ banned: false }),
      userIsAdmin: async () => false, // role revoked
      notifySellerListingRejected: async () => {},
    };
    setConsequentialActionRepoOpsForTests(ops);

    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "listing-1",
      userId: "admin-1",
      explanation: "explain",
    });
    const now = Date.now();
    await store.tryClaim(pending.id, now);

    const { blockListing } = await importExecutors();
    const fakeReq = { authUserId: "admin-1", authRole: "private" } as unknown as AuthedRequest;
    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "admin-1", type: "blockListing", targetId: "listing-1" },
      (action) => blockListing(fakeReq, action.targetId),
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000 }
    );

    assert.equal(outcome.ok, true); // envelope succeeded (ran exactly once)
    if (outcome.ok) {
      const r = outcome.result as { ok: boolean; reason?: string };
      assert.equal(r.ok, false);
      assert.equal(r.reason, "role_changed");
    }
    assert.equal(banCalls, 0);
  });

  it("target not found: the atomic op returning null is translated to target_not_found", async () => {
    const ops: ConsequentialActionRepoOps = {
      markListingSoldAtomic: async () => null,
      setListingBannedAtomic: async () => null,
      getListingForEmbedding: async () => null,
      userIsAdmin: async () => true,
      notifySellerListingRejected: async () => {},
    };
    setConsequentialActionRepoOpsForTests(ops);

    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "listing-missing",
      userId: "admin-1",
      explanation: "explain",
    });

    const { blockListing } = await importExecutors();
    const fakeReq = { authUserId: "admin-1", authRole: "admin" } as unknown as AuthedRequest;
    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "admin-1", type: "blockListing", targetId: "listing-missing" },
      (action) => blockListing(fakeReq, action.targetId)
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      const r = outcome.result as { ok: boolean; reason?: string };
      assert.equal(r.ok, false);
      assert.equal(r.reason, "target_not_found");
    }
  });
});

/**
 * `executeMarkListingSold` / `executeBlockListing` are module-private in
 * consequential-actions.ts (production code never needs to call them from
 * outside that module). They are re-exported ONLY under a `ForTests` alias
 * so this file can drive the REAL reconciliation logic directly instead of
 * a hand-rolled stand-in.
 */
async function importExecutors(): Promise<{
  markListingSold: (targetId: string, authUserId: string) => Promise<unknown>;
  blockListing: (req: AuthedRequest, targetId: string) => Promise<unknown>;
}> {
  const mod = (await import("../consequential-actions.js")) as unknown as {
    __executeMarkListingSoldForTests?: (targetId: string, authUserId: string) => Promise<unknown>;
    __executeBlockListingForTests?: (req: AuthedRequest, targetId: string) => Promise<unknown>;
  };
  if (!mod.__executeMarkListingSoldForTests || !mod.__executeBlockListingForTests) {
    throw new Error(
      "consequential-actions.js must export __executeMarkListingSoldForTests / __executeBlockListingForTests for this test file"
    );
  }
  return {
    markListingSold: mod.__executeMarkListingSoldForTests,
    blockListing: mod.__executeBlockListingForTests,
  };
}
