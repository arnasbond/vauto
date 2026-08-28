/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 * Audit remediation #3 — proves the DURABLE store (real migration SQL,
 * applied against PGlite — a real embedded PostgreSQL, not an emulation)
 * has the exact same exactly-once / never-undefined guarantees as the
 * in-memory store, via the identical `PendingActionStore` contract and the
 * identical `confirmConsequentialAction` policy function.
 *
 * Uses PGlite (already a declared devDependency, used by every other
 * financial-domain test suite in this repo) — no new dependency, no live
 * Postgres/Docker required, no network access.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  cancelConsequentialAction,
  confirmConsequentialAction,
  proposeConsequentialAction,
  type PendingConsequentialAction,
} from "../consequential-action-policy.js";
import {
  createPostgresPendingActionStore,
  CONSEQUENTIAL_ACTION_MIGRATION_SQL,
  type ConsequentialActionQueryable,
} from "../consequential-action-store-postgres.js";
import { CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS } from "../consequential-action-policy.js";

function adaptPglite(db: PGlite): ConsequentialActionQueryable {
  return {
    async query(text, params = []) {
      const res = await db.query(text, params as never[]);
      return { rows: (res.rows ?? []) as never[] };
    },
  };
}

function countingExecutor<TType extends "markListingSold" | "blockListing">() {
  let calls = 0;
  const execute = async (action: PendingConsequentialAction<TType>) => {
    calls += 1;
    return { ok: true as const, listingId: action.targetId, callNumber: calls };
  };
  return { execute, callCount: () => calls };
}

describe("PostgreSQL-backed PendingActionStore (PGlite) — migration + CAS correctness", () => {
  let pglite: PGlite;
  let db: ConsequentialActionQueryable;

  before(async () => {
    pglite = new PGlite();
    db = adaptPglite(pglite);
    await pglite.exec(CONSEQUENTIAL_ACTION_MIGRATION_SQL);
  });

  after(async () => {
    await pglite.close();
  });

  it("insert + get round-trips a PENDING row through real PostgreSQL DDL/DML", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "pg-listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    assert.equal(pending.state, "PENDING");

    const fetched = await store.get(pending.id);
    assert.ok(fetched);
    assert.equal(fetched?.state, "PENDING");
    assert.equal(fetched?.targetId, "pg-listing-1");
    assert.equal(fetched?.userId, "user-1");
  });

  it("executes exactly once, replay is idempotent, and rejects wrong user/target/type/expired — same contract as in-memory", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "pg-listing-2",
      userId: "admin-1",
      explanation: "explain",
    });
    const { execute, callCount } = countingExecutor<"blockListing">();
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "admin-1",
      type: "blockListing" as const,
      targetId: "pg-listing-2",
    };

    const wrongUser = await confirmConsequentialAction(
      store,
      { ...confirmParams, userId: "attacker" },
      execute
    );
    assert.equal(wrongUser.ok, false);
    if (!wrongUser.ok) assert.equal(wrongUser.reason, "wrong_user");
    assert.equal(callCount(), 0);

    const first = await confirmConsequentialAction(store, confirmParams, execute);
    const second = await confirmConsequentialAction(store, confirmParams, execute);
    assert.equal(callCount(), 1);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(first.replay, false);
      assert.equal(second.replay, true);
      assert.deepEqual(second.result, first.result);
    }

    const row = await store.get(pending.id);
    assert.equal(row?.state, "SUCCEEDED");
  });

  it("expired proposal atomically transitions to EXPIRED in the real table and never executes", async () => {
    const store = createPostgresPendingActionStore(db);
    const now = Date.now();
    const pending = await proposeConsequentialAction(
      store,
      { type: "markListingSold", targetId: "pg-listing-3", userId: "user-1", explanation: "explain" },
      { now, ttlMs: 1000 }
    );
    const { execute, callCount } = countingExecutor<"markListingSold">();

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "pg-listing-3" },
      execute,
      { now: now + 5000 }
    );
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "expired");
    assert.equal(callCount(), 0);

    const row = await store.get(pending.id);
    assert.equal(row?.state, "EXPIRED");
  });

  it("AUDIT #1/#3 — two concurrent confirmConsequentialAction calls against the REAL atomic UPDATE...RETURNING CAS never double-execute", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "pg-listing-4",
      userId: "user-1",
      explanation: "explain",
    });
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = async () => {
      calls += 1;
      await gate;
      return { sold: true };
    };
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "user-1",
      type: "markListingSold" as const,
      targetId: "pg-listing-4",
    };

    const first = confirmConsequentialAction(store, confirmParams, execute);
    const second = confirmConsequentialAction(store, confirmParams, execute);
    await new Promise((r) => setTimeout(r, 30));
    release!();
    const [a, b] = await Promise.all([first, second]);

    assert.equal(calls, 1, "the real Postgres UPDATE...WHERE state='PENDING' CAS must admit exactly one claimer");
    assert.notEqual(a, undefined);
    assert.notEqual(b, undefined);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok && b.ok) {
      assert.deepEqual(a.result, { sold: true });
      assert.deepEqual(b.result, a.result);
    }

    const row = await store.get(pending.id);
    assert.equal(row?.state, "SUCCEEDED");
  });

  it("AUDIT #2 — executor throws against the real store: terminates FAILED, never left EXECUTING, replay-safe", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "pg-listing-5",
      userId: "admin-1",
      explanation: "explain",
    });
    let calls = 0;
    const execute = async () => {
      calls += 1;
      throw new Error("simulated DB write failure");
    };
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "admin-1",
      type: "blockListing" as const,
      targetId: "pg-listing-5",
    };

    const outcome = await confirmConsequentialAction(store, confirmParams, execute);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "execution_failed");

    const row = await store.get(pending.id);
    assert.equal(row?.state, "FAILED");
    // AUDIT B — sanitized/generic only, never the raw exception message.
    assert.equal(row?.errorMessage, "execution_failed");
    assert.doesNotMatch(row?.errorMessage ?? "", /simulated DB write failure/);

    const replay = await confirmConsequentialAction(store, confirmParams, execute);
    assert.equal(calls, 1, "FAILED must never be retried automatically, even against the real store");
    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.reason, "execution_failed");
  });

  it("cancellation-vs-confirmation race against the real store: mutually exclusive, never both/neither", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "pg-listing-6",
      userId: "admin-1",
      explanation: "explain",
    });
    const { execute, callCount } = countingExecutor<"blockListing">();
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "admin-1",
      type: "blockListing" as const,
      targetId: "pg-listing-6",
    };

    const [confirmResult, cancelResult] = await Promise.all([
      confirmConsequentialAction(store, confirmParams, execute),
      cancelConsequentialAction(store, { pendingActionId: pending.id, userId: "admin-1" }),
    ]);

    const executed = callCount() === 1;
    const cancelled = cancelResult.ok === true;
    assert.notEqual(executed, cancelled);
    if (executed) {
      assert.equal(confirmResult.ok, true);
    } else {
      assert.equal(confirmResult.ok, false);
      if (!confirmResult.ok) assert.equal(confirmResult.reason, "cancelled");
    }
  });

  it("AUDIT A — a fresh EXECUTING lease is never stolen against the REAL Postgres CAS", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "pg-listing-7",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();
    const original = await store.tryClaim(pending.id, now);
    assert.equal(original.claimed, true);

    const stealAttempt = await store.tryClaim(pending.id, now + 500);
    assert.equal(stealAttempt.claimed, false, "a fresh lease must never be stolen");
    assert.equal(stealAttempt.action?.state, "EXECUTING");
  });

  it("AUDIT A — a stale EXECUTING lease has exactly one recovery winner against the REAL Postgres CAS", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "pg-listing-8",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();
    const original = await store.tryClaim(pending.id, now); // simulates a crashed prior claim
    assert.equal(original.claimed, true);

    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const attempts = await Promise.all([
      store.tryClaim(pending.id, staleNow),
      store.tryClaim(pending.id, staleNow),
      store.tryClaim(pending.id, staleNow),
    ]);
    const winners = attempts.filter((a) => a.claimed);
    assert.equal(winners.length, 1, "exactly one caller may reclaim a stale lease, even against the real DB row lock");
  });

  it("AUDIT A — crash after domain mutation but before completion: recovery reconciles to SUCCEEDED without a second mutation (already-sold)", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "pg-listing-9",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();
    const claim = await store.tryClaim(pending.id, now); // simulated crashed process claimed it
    assert.equal(claim.claimed, true);

    // The crashed process's mutation actually landed out-of-band (this is
    // what "already sold" reconciliation checks against in production).
    let authoritativeStatus: "active" | "sold" = "sold";
    let mutationCount = 0;
    const idempotentExecute = async () => {
      if (authoritativeStatus === "sold") return { ok: true as const, alreadyDone: true };
      mutationCount += 1;
      authoritativeStatus = "sold";
      return { ok: true as const, alreadyDone: false };
    };

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "pg-listing-9" },
      idempotentExecute,
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000 }
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.deepEqual(outcome.result, { ok: true, alreadyDone: true });
    assert.equal(mutationCount, 0);

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
  });

  it("AUDIT A — crash before domain mutation ran: recovery performs the still-pending idempotent mutation exactly once", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "pg-listing-10",
      userId: "admin-1",
      explanation: "explain",
    });
    const now = Date.now();
    const claim = await store.tryClaim(pending.id, now);
    assert.equal(claim.claimed, true);

    let authoritativeBanned = false; // never mutated by the crashed attempt
    let mutationCount = 0;
    let notificationCount = 0;
    const idempotentExecute = async () => {
      if (authoritativeBanned) return { ok: true as const, alreadyDone: true };
      mutationCount += 1;
      authoritativeBanned = true;
      notificationCount += 1; // notification only ever fires on the actual transition
      return { ok: true as const, alreadyDone: false };
    };

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "admin-1", type: "blockListing", targetId: "pg-listing-10" },
      idempotentExecute,
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000 }
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.deepEqual(outcome.result, { ok: true, alreadyDone: false });
    assert.equal(mutationCount, 1);
    assert.equal(notificationCount, 1, "exactly one notification for the actual transition");

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
  });

  it("3rd audit — tryClaim mints a fresh token on claim, and a DIFFERENT token on stale-lease reclaim, against the REAL Postgres row", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "pg-listing-11",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();
    const claim1 = await store.tryClaim(pending.id, now);
    const token1 = claim1.action?.executionToken;
    assert.ok(token1);

    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const claim2 = await store.tryClaim(pending.id, staleNow);
    const token2 = claim2.action?.executionToken;
    assert.ok(token2);
    assert.notEqual(token2, token1, "reclaim must mint a brand-new fencing token in the durable row too");
  });

  it("3rd audit — complete() with a STALE token is a CAS miss against the REAL Postgres row — never a write, even after the new owner finishes", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "pg-listing-12",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();
    const claim1 = await store.tryClaim(pending.id, now);
    const token1 = claim1.action?.executionToken as string;

    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const claim2 = await store.tryClaim(pending.id, staleNow);
    const token2 = claim2.action?.executionToken as string;

    const oldMiss = await store.complete(pending.id, token1, { state: "SUCCEEDED", result: { from: "old" } });
    assert.equal(oldMiss.written, false, "the OLD token must never write against the real Postgres row");
    assert.equal(oldMiss.action?.state, "EXECUTING");

    const newWrite = await store.complete(pending.id, token2, { state: "SUCCEEDED", result: { from: "new" } });
    assert.equal(newWrite.written, true);

    const oldMissAfter = await store.complete(pending.id, token1, {
      state: "SUCCEEDED",
      result: { from: "old-again" },
    });
    assert.equal(oldMissAfter.written, false);
    assert.deepEqual(oldMissAfter.action?.result, { from: "new" });
  });

  it("AUDIT #4 — the exact slow-but-alive scenario against the REAL Postgres store: old token cannot terminalize; one authoritative result; replay matches", async () => {
    const store = createPostgresPendingActionStore(db);
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "pg-listing-13",
      userId: "user-1",
      explanation: "explain",
    });
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "user-1",
      type: "markListingSold" as const,
      targetId: "pg-listing-13",
    };
    const now = Date.now();

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let oldCalls = 0;
    const oldExecute = async () => {
      oldCalls += 1;
      await gate;
      return { ok: true as const, from: "OLD-fabricated-result" };
    };

    // First executor acquires the lease and pauses beyond the lease duration.
    const firstConfirm = confirmConsequentialAction(store, confirmParams, oldExecute, { now });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(oldCalls, 1);

    // Second caller atomically reclaims (real Postgres CAS) with a
    // different fencing token and runs to completion.
    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const secondOutcome = await confirmConsequentialAction(
      store,
      confirmParams,
      async () => ({ ok: true as const, from: "NEW-authoritative-result" }),
      { now: staleNow }
    );
    assert.equal(secondOutcome.ok, true);
    const midRow = await store.get(pending.id);
    assert.equal(midRow?.state, "SUCCEEDED");

    // Release both executors in adversarial order — the original, slow one
    // released LAST, after the reclaimer already finished.
    release();
    const firstOutcome = await firstConfirm;

    assert.equal(oldCalls, 1);
    assert.equal(firstOutcome.ok, true);
    if (firstOutcome.ok && secondOutcome.ok) {
      assert.deepEqual(firstOutcome.result, secondOutcome.result);
      assert.deepEqual(firstOutcome.result, { ok: true, from: "NEW-authoritative-result" });
    }

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
    assert.deepEqual(finalRow?.result, { ok: true, from: "NEW-authoritative-result" });

    const replay = await confirmConsequentialAction(store, confirmParams, oldExecute, {
      now: staleNow + 2000,
    });
    assert.equal(oldCalls, 1, "replay must never re-invoke any executor");
    assert.equal(replay.ok, true);
    if (replay.ok) assert.deepEqual(replay.result, { ok: true, from: "NEW-authoritative-result" });
  });
});
