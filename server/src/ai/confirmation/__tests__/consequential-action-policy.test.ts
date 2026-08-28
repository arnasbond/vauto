/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 * Remediated after independent audit (race / exception / durability / LLM-echo).
 *
 * Pure deterministic policy tests (no DB, no Express, no LLM). Each test
 * uses its own isolated in-memory store so tests never share global state.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cancelConsequentialAction,
  confirmConsequentialAction,
  createInMemoryPendingActionStore,
  proposeConsequentialAction,
  CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS,
  type PendingConsequentialAction,
} from "../consequential-action-policy.js";

function countingExecutor<TType extends "markListingSold" | "blockListing">() {
  let calls = 0;
  const execute = async (action: PendingConsequentialAction<TType>) => {
    calls += 1;
    return { ok: true as const, listingId: action.targetId, callNumber: calls };
  };
  return { execute, callCount: () => calls };
}

/** A "controllable delayed executor" — resolves only once `release()` is called. */
function deferredExecutor<TResult>(resultFactory: () => TResult) {
  let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const execute = async (): Promise<TResult> => {
    calls += 1;
    await gate;
    return resultFactory();
  };
  return { execute, callCount: () => calls, release: () => release!() };
}

describe("proposeConsequentialAction — proposal never mutates anything", () => {
  it("returns an opaque pending action in state PENDING, without invoking any execution", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: 'Pažymėti skelbimą "BMW" kaip parduotą.',
    });
    assert.equal(pending.type, "markListingSold");
    assert.equal(pending.targetId, "listing-1");
    assert.equal(pending.userId, "user-1");
    assert.equal(pending.state, "PENDING");
    assert.equal(pending.result, undefined);
    assert.equal(pending.errorMessage, null);
    // Opaque, unguessable id (UUID v4 shape) — never derivable from chat text.
    assert.match(pending.id, /^[0-9a-f-]{36}$/i);
  });
});

describe("confirmConsequentialAction — exact explicit confirmation performs one authorized mutation", () => {
  it("executes exactly once for a correct, matching confirmation and terminates in SUCCEEDED", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const { execute, callCount } = countingExecutor<"markListingSold">();

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "listing-1" },
      execute
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.replay, false);
      assert.deepEqual(outcome.result, { ok: true, listingId: "listing-1", callNumber: 1 });
    }
    assert.equal(callCount(), 1);

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
  });

  it("bare/ambiguous confirmation phrases never reach this authority (no id => no execution)", async () => {
    // There is no textual parsing path into this function at all — the only
    // input that can trigger `execute` is the exact opaque pendingActionId.
    // A bare "taip"/"ok" string is not a valid id and is rejected outright.
    const store = createInMemoryPendingActionStore();
    await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const { execute, callCount } = countingExecutor<"markListingSold">();

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: "taip", userId: "user-1", type: "markListingSold", targetId: "listing-1" },
      execute
    );

    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "not_found");
    assert.equal(callCount(), 0);
  });

  it("wrong user cannot confirm another user's pending action", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const { execute, callCount } = countingExecutor<"markListingSold">();

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "attacker-2", type: "markListingSold", targetId: "listing-1" },
      execute
    );

    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "wrong_user");
    assert.equal(callCount(), 0);
  });

  it("wrong target id cannot confirm the action", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const { execute, callCount } = countingExecutor<"markListingSold">();

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "listing-OTHER" },
      execute
    );

    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "target_mismatch");
    assert.equal(callCount(), 0);
  });

  it("wrong action type cannot confirm the action", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const { execute, callCount } = countingExecutor<"markListingSold">();

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "blockListing", targetId: "listing-1" },
      execute as unknown as (a: PendingConsequentialAction<"blockListing">) => Promise<unknown>
    );

    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "type_mismatch");
    assert.equal(callCount(), 0);
  });

  it("expired token cannot confirm, and the row terminates in EXPIRED (not left PENDING forever)", async () => {
    const store = createInMemoryPendingActionStore();
    const now = Date.now();
    const pending = await proposeConsequentialAction(
      store,
      { type: "markListingSold", targetId: "listing-1", userId: "user-1", explanation: "explain" },
      { now, ttlMs: 1000 }
    );
    const { execute, callCount } = countingExecutor<"markListingSold">();

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "listing-1" },
      execute,
      { now: now + 5000 }
    );

    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "expired");
    assert.equal(callCount(), 0);

    const row = await store.get(pending.id);
    assert.equal(row?.state, "EXPIRED");
  });

  it("replay is idempotent — execute is never invoked twice, same result returned", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const { execute, callCount } = countingExecutor<"markListingSold">();
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "user-1",
      type: "markListingSold" as const,
      targetId: "listing-1",
    };

    const first = await confirmConsequentialAction(store, confirmParams, execute);
    const second = await confirmConsequentialAction(store, confirmParams, execute);
    const third = await confirmConsequentialAction(store, confirmParams, execute);

    assert.equal(callCount(), 1, "execute must run exactly once across all replays");
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, true);
    if (first.ok && second.ok && third.ok) {
      assert.equal(first.replay, false);
      assert.equal(second.replay, true);
      assert.equal(third.replay, true);
      assert.deepEqual(second.result, first.result);
      assert.deepEqual(third.result, first.result);
    }
  });

  it("ownership/role change between proposal and confirmation blocks execution and caches the block", async () => {
    // Simulates: execute() re-checks authority fresh at execution time (not
    // the stale proposal-time snapshot) and finds it no longer holds.
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    let executeCalls = 0;
    let currentOwnerAtExecutionTime = "someone-else"; // ownership changed after proposal
    const execute = async () => {
      executeCalls += 1;
      if (currentOwnerAtExecutionTime !== "user-1") {
        return { ok: false as const, reason: "ownership_changed" as const };
      }
      return { ok: true as const };
    };
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "user-1",
      type: "markListingSold" as const,
      targetId: "listing-1",
    };

    const outcome = await confirmConsequentialAction(store, confirmParams, execute);
    assert.equal(outcome.ok, true); // confirmation-envelope succeeded (ran exactly once)
    if (outcome.ok) {
      assert.deepEqual(outcome.result, { ok: false, reason: "ownership_changed" });
    }

    // Even if ownership is "restored" afterward, replay must NOT re-execute
    // or flip the cached (blocked) outcome — it is terminal.
    currentOwnerAtExecutionTime = "user-1";
    const replay = await confirmConsequentialAction(store, confirmParams, execute);
    assert.equal(executeCalls, 1);
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.replay, true);
      assert.deepEqual(replay.result, { ok: false, reason: "ownership_changed" });
    }
  });

  it("AUDIT #1 — two simultaneous confirmations with a controllable delayed executor: exactly one executor call, both receive identical defined outcomes", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const { execute, callCount, release } = deferredExecutor<{ sold: true; at: number }>(
      () => ({ sold: true, at: 42 })
    );
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "user-1",
      type: "markListingSold" as const,
      targetId: "listing-1",
    };

    const first = confirmConsequentialAction(store, confirmParams, execute);
    const second = confirmConsequentialAction(store, confirmParams, execute);

    // Give both calls a chance to reach (and block inside) the executor
    // before releasing it, to actually exercise the EXECUTING-race window.
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(callCount(), 1, "only the CAS winner may invoke execute()");
    release();

    const [a, b] = await Promise.all([first, second]);

    assert.equal(callCount(), 1, "execute must never be invoked a second time");
    assert.notEqual(a, undefined);
    assert.notEqual(b, undefined);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok && b.ok) {
      assert.deepEqual(a.result, { sold: true, at: 42 });
      assert.deepEqual(b.result, a.result, "concurrent confirmers must observe an identical result");
      // Exactly one of the two was the actual executor (replay:false); the
      // other observed it (replay:true) — never both false, never both true.
      assert.equal([a.replay, b.replay].filter((r) => r === false).length, 1);
      assert.equal([a.replay, b.replay].filter((r) => r === true).length, 1);
    }

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
  });

  it("AUDIT #1 — three-way concurrent confirm never double-executes and never returns undefined", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "listing-9",
      userId: "admin-1",
      explanation: "explain",
    });
    const { execute, callCount, release } = deferredExecutor<{ banned: true }>(
      () => ({ banned: true })
    );
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "admin-1",
      type: "blockListing" as const,
      targetId: "listing-9",
    };

    const calls = [
      confirmConsequentialAction(store, confirmParams, execute),
      confirmConsequentialAction(store, confirmParams, execute),
      confirmConsequentialAction(store, confirmParams, execute),
    ];
    await new Promise((r) => setTimeout(r, 20));
    release();
    const results = await Promise.all(calls);

    assert.equal(callCount(), 1);
    for (const r of results) {
      assert.notEqual(r, undefined);
      assert.equal(r.ok, true);
      if (r.ok) assert.deepEqual(r.result, { banned: true });
    }
  });

  it("AUDIT #2 — executor throws: the action terminates in a typed FAILED outcome, never stuck consumed without a result", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    let calls = 0;
    const execute = async () => {
      calls += 1;
      throw new Error("simulated DB error during execution");
    };
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "user-1",
      type: "markListingSold" as const,
      targetId: "listing-1",
    };

    const outcome = await confirmConsequentialAction(store, confirmParams, execute);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.reason, "execution_failed");
      assert.equal(outcome.replay, false);
    }
    assert.equal(calls, 1);

    const row = await store.get(pending.id);
    assert.equal(row?.state, "FAILED");
    // AUDIT B — sanitized/generic only, never the raw exception message
    // (which could leak DB schema/internals into a persisted row).
    assert.equal(row?.errorMessage, "execution_failed");
    assert.doesNotMatch(row?.errorMessage ?? "", /simulated DB error/);

    // Replay after a thrown executor must NOT re-invoke execute — it is a
    // terminal state like any other.
    const replay = await confirmConsequentialAction(store, confirmParams, execute);
    assert.equal(calls, 1, "a FAILED terminal action must never be retried automatically");
    assert.equal(replay.ok, false);
    if (!replay.ok) {
      assert.equal(replay.reason, "execution_failed");
      assert.equal(replay.replay, true);
    }
  });

  it("AUDIT #2 — concurrent confirms where the executor throws: all receive the same typed failure, never undefined", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
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
      throw new Error("simulated DB error");
    };
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "user-1",
      type: "markListingSold" as const,
      targetId: "listing-1",
    };

    const first = confirmConsequentialAction(store, confirmParams, execute);
    const second = confirmConsequentialAction(store, confirmParams, execute);
    await new Promise((r) => setTimeout(r, 20));
    release!();
    const [a, b] = await Promise.all([first, second]);

    assert.equal(calls, 1);
    assert.notEqual(a, undefined);
    assert.notEqual(b, undefined);
    assert.equal(a.ok, false);
    assert.equal(b.ok, false);
    if (!a.ok && !b.ok) {
      assert.equal(a.reason, "execution_failed");
      assert.equal(b.reason, "execution_failed");
    }
  });

  it("AUDIT — cancellation-vs-confirmation concurrency: exactly one of {executed once, cancelled with no execution} holds, never both/neither", async () => {
    for (let i = 0; i < 25; i += 1) {
      const store = createInMemoryPendingActionStore();
      const pending = await proposeConsequentialAction(store, {
        type: "blockListing",
        targetId: `listing-race-${i}`,
        userId: "admin-1",
        explanation: "explain",
      });
      const { execute, callCount } = countingExecutor<"blockListing">();
      const confirmParams = {
        pendingActionId: pending.id,
        userId: "admin-1",
        type: "blockListing" as const,
        targetId: `listing-race-${i}`,
      };

      const [confirmResult, cancelResult] = await Promise.all([
        confirmConsequentialAction(store, confirmParams, execute),
        cancelConsequentialAction(store, { pendingActionId: pending.id, userId: "admin-1" }),
      ]);

      const executed = callCount() === 1;
      const cancelled = cancelResult.ok === true;
      // Mutually exclusive outcomes — never both, never neither.
      assert.notEqual(executed, cancelled, `iteration ${i}: executed=${executed} cancelled=${cancelled}`);

      if (executed) {
        assert.equal(confirmResult.ok, true);
        assert.equal(cancelResult.ok, false);
        if (!cancelResult.ok) assert.equal(cancelResult.reason, "already_consumed");
      } else {
        assert.equal(confirmResult.ok, false);
        if (!confirmResult.ok) assert.equal(confirmResult.reason, "cancelled");
        assert.equal(callCount(), 0);
      }
    }
  });
});

describe("AUDIT A — stale EXECUTING lease crash recovery", () => {
  it("a fresh EXECUTING lease is never stolen — a reclaim attempt shortly after claiming reports claimed:false", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();

    const original = await store.tryClaim(pending.id, now);
    assert.equal(original.claimed, true);

    const stealAttempt = await store.tryClaim(pending.id, now + 500);
    assert.equal(stealAttempt.claimed, false, "a fresh lease must never be stolen");
    assert.equal(stealAttempt.action?.state, "EXECUTING");

    const rightBeforeLeaseExpiry = await store.tryClaim(
      pending.id,
      now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS - 1
    );
    assert.equal(rightBeforeLeaseExpiry.claimed, false, "must not be stolen right up to the lease boundary");
  });

  it("a stale EXECUTING lease has exactly one recovery winner among concurrent reclaimers", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();
    const original = await store.tryClaim(pending.id, now); // simulate a crashed prior claim
    assert.equal(original.claimed, true);

    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const attempts = await Promise.all([
      store.tryClaim(pending.id, staleNow),
      store.tryClaim(pending.id, staleNow),
      store.tryClaim(pending.id, staleNow),
    ]);

    const winners = attempts.filter((a) => a.claimed);
    assert.equal(winners.length, 1, "exactly one caller may reclaim a stale lease");
  });

  it("crash AFTER the domain mutation succeeded but BEFORE completion was persisted: recovery finalizes SUCCEEDED without a second mutation", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();

    // Simulate a crashed process: it claimed the row (PENDING -> EXECUTING)...
    const claim = await store.tryClaim(pending.id, now);
    assert.equal(claim.claimed, true);
    // ...and its domain mutation ACTUALLY SUCCEEDED out-of-band...
    let authoritativeStatus: "active" | "sold" = "sold";
    // ...but it crashed before ever calling store.complete() — the row is
    // left EXECUTING forever until recovery kicks in.
    const stillExecuting = await store.get(pending.id);
    assert.equal(stillExecuting?.state, "EXECUTING");

    let mutationCount = 0;
    const idempotentExecute = async () => {
      if (authoritativeStatus === "sold") {
        // Reconciliation: already done — no further mutation.
        return { ok: true as const, alreadyDone: true };
      }
      mutationCount += 1;
      authoritativeStatus = "sold";
      return { ok: true as const, alreadyDone: false };
    };

    // A later confirm call (e.g. the user's client retrying) arrives after
    // the lease has gone stale — this IS the recovery path.
    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "listing-1" },
      idempotentExecute,
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000 }
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.deepEqual(outcome.result, { ok: true, alreadyDone: true });
    assert.equal(mutationCount, 0, "the crashed attempt already mutated — recovery must not mutate again");

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
  });

  it("crash BEFORE the domain mutation ran: recovery safely performs the (still pending) idempotent mutation exactly once", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();

    // Simulate a crashed process that claimed the row but crashed BEFORE
    // ever attempting the domain mutation (e.g. process killed between the
    // CAS claim and the first repository call).
    const claim = await store.tryClaim(pending.id, now);
    assert.equal(claim.claimed, true);

    let authoritativeStatus: "active" | "sold" = "active"; // never mutated
    let mutationCount = 0;
    const idempotentExecute = async () => {
      if (authoritativeStatus === "sold") {
        return { ok: true as const, alreadyDone: true };
      }
      mutationCount += 1;
      authoritativeStatus = "sold";
      return { ok: true as const, alreadyDone: false };
    };

    const outcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "listing-1" },
      idempotentExecute,
      { now: now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000 }
    );

    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.deepEqual(outcome.result, { ok: true, alreadyDone: false });
    assert.equal(mutationCount, 1, "recovery must perform the mutation exactly once when it never happened");
    assert.equal(authoritativeStatus, "sold");

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
  });

  it("does NOT reclaim a fresh (non-stale) EXECUTING row via confirmConsequentialAction — a second confirm within the lease observes the SAME winner's result instead of re-executing", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();
    const claim = await store.tryClaim(pending.id, now); // simulate an in-flight (not crashed) executor
    assert.equal(claim.claimed, true);

    let executeCalls = 0;
    const execute = async () => {
      executeCalls += 1;
      return { ok: true as const };
    };

    // A second confirm arrives almost immediately — well within the lease.
    const confirmPromise = confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "user-1", type: "markListingSold", targetId: "listing-1" },
      execute,
      { now: now + 100 }
    );

    // The ORIGINAL (not crashed) owner finishes shortly after.
    await new Promise((r) => setTimeout(r, 20));
    const originalToken = claim.action?.executionToken;
    assert.ok(originalToken);
    await store.complete(pending.id, originalToken!, {
      state: "SUCCEEDED",
      result: { ok: true, original: true },
    });

    const outcome = await confirmPromise;
    assert.equal(executeCalls, 0, "a fresh lease must never trigger a second execute() call");
    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.deepEqual(outcome.result, { ok: true, original: true });
  });
});

describe("3rd audit — fencing token: an old executor whose lease was reclaimed can never terminalize", () => {
  it("tryClaim mints a fresh token on a fresh claim, and a DIFFERENT token on a stale-lease reclaim", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();

    const claim1 = await store.tryClaim(pending.id, now);
    assert.equal(claim1.claimed, true);
    const token1 = claim1.action?.executionToken;
    assert.equal(typeof token1, "string");
    assert.ok(token1);

    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const claim2 = await store.tryClaim(pending.id, staleNow);
    assert.equal(claim2.claimed, true, "a stale lease must still be reclaimable");
    const token2 = claim2.action?.executionToken;
    assert.ok(token2);
    assert.notEqual(token2, token1, "a reclaim must mint a brand-new fencing token");
  });

  it("complete() with a STALE (reclaimed) token is a CAS miss — never a write, before OR after the new owner finishes", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const now = Date.now();
    const claim1 = await store.tryClaim(pending.id, now);
    const token1 = claim1.action?.executionToken as string;

    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const claim2 = await store.tryClaim(pending.id, staleNow);
    const token2 = claim2.action?.executionToken as string;

    // The OLD token cannot complete a lease it no longer owns, WHILE the
    // new owner is still executing.
    const oldAttemptWhileNewStillRunning = await store.complete(pending.id, token1, {
      state: "SUCCEEDED",
      result: { from: "old" },
    });
    assert.equal(oldAttemptWhileNewStillRunning.written, false);
    assert.equal(oldAttemptWhileNewStillRunning.action?.state, "EXECUTING");

    // The NEW (current) token completes successfully.
    const newAttempt = await store.complete(pending.id, token2, {
      state: "SUCCEEDED",
      result: { from: "new" },
    });
    assert.equal(newAttempt.written, true);

    // The OLD token STILL cannot complete even AFTER the new owner
    // finished — never fabricates a second terminal write.
    const oldAttemptAfterNewFinished = await store.complete(pending.id, token1, {
      state: "SUCCEEDED",
      result: { from: "old-again" },
    });
    assert.equal(oldAttemptAfterNewFinished.written, false);
    assert.equal(oldAttemptAfterNewFinished.action?.state, "SUCCEEDED");
    assert.deepEqual(oldAttemptAfterNewFinished.action?.result, { from: "new" });
  });

  it("AUDIT #4 — the exact slow-but-alive scenario: old executor finishes AFTER the new owner has ALREADY completed and observes the SAME authoritative result, never its own", async () => {
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
    const now = Date.now();

    // First executor acquires the lease and pauses beyond the lease duration.
    const oldExec = deferredExecutor(() => ({ ok: true as const, from: "OLD-fabricated-result" }));
    const firstConfirm = confirmConsequentialAction(store, confirmParams, oldExec.execute, { now });
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(oldExec.callCount(), 1, "the old executor must have started (and be blocked) before the reclaim");

    // Second caller atomically reclaims with a different fencing token and
    // runs to completion (no gate — it is the fast/authoritative attempt).
    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const secondOutcome = await confirmConsequentialAction(
      store,
      confirmParams,
      async () => ({ ok: true as const, from: "NEW-authoritative-result" }),
      { now: staleNow }
    );
    assert.equal(secondOutcome.ok, true);
    const midRow = await store.get(pending.id);
    assert.equal(midRow?.state, "SUCCEEDED", "the new owner has already terminalized before the old one is released");

    // Release both executors in adversarial order — the ORIGINAL (old,
    // slow) one is released LAST, after the reclaimer already finished.
    oldExec.release();
    const firstOutcome = await firstConfirm;

    assert.equal(oldExec.callCount(), 1, "execute() ran exactly once for the old attempt — it is not re-invoked");
    assert.equal(firstOutcome.ok, true);
    assert.equal(secondOutcome.ok, true);
    if (firstOutcome.ok && secondOutcome.ok) {
      assert.deepEqual(
        firstOutcome.result,
        secondOutcome.result,
        "the fenced-out original executor must observe the SAME authoritative result"
      );
      assert.deepEqual(firstOutcome.result, { ok: true, from: "NEW-authoritative-result" });
    }

    const finalRow = await store.get(pending.id);
    assert.equal(finalRow?.state, "SUCCEEDED");
    assert.deepEqual(finalRow?.result, { ok: true, from: "NEW-authoritative-result" });

    // A later replay call must receive the identical defined terminal outcome.
    const replay = await confirmConsequentialAction(store, confirmParams, oldExec.execute, {
      now: staleNow + 2000,
    });
    assert.equal(oldExec.callCount(), 1, "replay must never re-invoke any executor");
    assert.equal(replay.ok, true);
    if (replay.ok) assert.deepEqual(replay.result, { ok: true, from: "NEW-authoritative-result" });
  });

  it("AUDIT #4b — old executor finishes WHILE the new owner is still executing: it AWAITS and returns the same eventual authoritative result, never a fabricated one", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "listing-9",
      userId: "admin-1",
      explanation: "explain",
    });
    const confirmParams = {
      pendingActionId: pending.id,
      userId: "admin-1",
      type: "blockListing" as const,
      targetId: "listing-9",
    };
    const now = Date.now();

    const oldExec = deferredExecutor(() => ({ ok: true as const, from: "OLD-fabricated" }));
    const firstConfirm = confirmConsequentialAction(store, confirmParams, oldExec.execute, { now });
    await new Promise((r) => setTimeout(r, 15));

    const staleNow = now + CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS + 1000;
    const newExec = deferredExecutor(() => ({ ok: true as const, from: "NEW-authoritative" }));
    const secondConfirm = confirmConsequentialAction(store, confirmParams, newExec.execute, { now: staleNow });
    await new Promise((r) => setTimeout(r, 15));

    // Release the OLD executor FIRST — it finishes while the NEW owner is
    // still mid-flight. It must NOT fabricate a result; it must wait.
    oldExec.release();
    await new Promise((r) => setTimeout(r, 30));
    const midRow = await store.get(pending.id);
    assert.equal(midRow?.state, "EXECUTING", "the new owner has not finished yet — no terminal result exists to fabricate from");

    newExec.release();
    const [firstOutcome, secondOutcome] = await Promise.all([firstConfirm, secondConfirm]);

    assert.equal(oldExec.callCount(), 1);
    assert.equal(newExec.callCount(), 1);
    assert.equal(firstOutcome.ok, true);
    assert.equal(secondOutcome.ok, true);
    if (firstOutcome.ok && secondOutcome.ok) {
      assert.deepEqual(firstOutcome.result, { ok: true, from: "NEW-authoritative" });
      assert.deepEqual(firstOutcome.result, secondOutcome.result);
    }
  });
});

describe("cancelConsequentialAction — cancellation clears the pending action", () => {
  it("cancels a pending action and blocks any subsequent confirmation", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "listing-9",
      userId: "admin-1",
      explanation: "explain",
    });

    const cancelOutcome = await cancelConsequentialAction(store, {
      pendingActionId: pending.id,
      userId: "admin-1",
    });
    assert.equal(cancelOutcome.ok, true);

    const row = await store.get(pending.id);
    assert.equal(row?.state, "CANCELLED");

    const { execute, callCount } = countingExecutor<"blockListing">();
    const confirmOutcome = await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "admin-1", type: "blockListing", targetId: "listing-9" },
      execute
    );
    assert.equal(confirmOutcome.ok, false);
    if (!confirmOutcome.ok) assert.equal(confirmOutcome.reason, "cancelled");
    assert.equal(callCount(), 0);
  });

  it("wrong user cannot cancel another user's pending action", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "listing-9",
      userId: "admin-1",
      explanation: "explain",
    });
    const outcome = await cancelConsequentialAction(store, {
      pendingActionId: pending.id,
      userId: "someone-else",
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "wrong_user");
  });

  it("cannot cancel an already-consumed (executed) action", async () => {
    const store = createInMemoryPendingActionStore();
    const pending = await proposeConsequentialAction(store, {
      type: "blockListing",
      targetId: "listing-9",
      userId: "admin-1",
      explanation: "explain",
    });
    const { execute } = countingExecutor<"blockListing">();
    await confirmConsequentialAction(
      store,
      { pendingActionId: pending.id, userId: "admin-1", type: "blockListing", targetId: "listing-9" },
      execute
    );

    const outcome = await cancelConsequentialAction(store, {
      pendingActionId: pending.id,
      userId: "admin-1",
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "already_consumed");
  });

  it("cancelling an unknown id fails safely", async () => {
    const store = createInMemoryPendingActionStore();
    const outcome = await cancelConsequentialAction(store, {
      pendingActionId: "does-not-exist",
      userId: "admin-1",
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "not_found");
  });
});
