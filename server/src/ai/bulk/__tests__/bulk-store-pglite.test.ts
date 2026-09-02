/**
 * F6.2 — durable bulk store against a REAL PostgreSQL-compatible engine
 * (PGlite): atomic claim via the unique constraint, replay reads the saved
 * result, CAS recovery ownership with lease, CAS state transitions, per-item
 * persistence, and the atomic terminalization transaction (results + items +
 * audit commit together or not at all).
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPostgresBulkOperationStore,
  type BulkStoreQueryable,
} from "../bulk-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function adaptPglite(db: PGlite): BulkStoreQueryable {
  const q: BulkStoreQueryable = {
    async query<T extends Record<string, unknown>>(text: string, params?: unknown[]) {
      const res = await db.query(text, params as never[]);
      return { rows: res.rows as T[] };
    },
    async withTransaction<T>(fn: (tx: BulkStoreQueryable) => Promise<T>): Promise<T> {
      return db.transaction(async (txDb) => {
        const tx: BulkStoreQueryable = {
          async query<Tx extends Record<string, unknown>>(text: string, params?: unknown[]) {
            const res = await txDb.query(text, params as never[]);
            return { rows: res.rows as Tx[] };
          },
          withTransaction: (inner) => inner(tx),
        };
        return fn(tx);
      });
    },
  };
  return q;
}

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../../../migrations/064_f6_bulk_operations.sql"),
  "utf8"
);

const LEASE = 30_000;

describe("F6.2 — durable bulk store (PGlite)", () => {
  let db: PGlite;
  let q: BulkStoreQueryable;

  before(async () => {
    db = new PGlite();
    await db.exec(MIGRATION_SQL);
    q = adaptPglite(db);
  });

  after(async () => {
    await db.close();
  });

  it("unique constraint: parallel claims for the same (actor, operation, key) create exactly one row", async () => {
    const store = createPostgresBulkOperationStore(q);
    const input = {
      actorId: "actor-1",
      operation: "hide" as const,
      idempotencyKey: "k-race",
      proposalDigest: "d1",
      targetImage: [{ id: "l-1", verdict: "owned" as const }],
      leaseMs: LEASE,
      nowMs: 1_000,
    };
    const [a, b] = await Promise.all([
      store.tryClaimOperation(input),
      store.tryClaimOperation(input),
    ]);
    const createdCount = [a, b].filter((r) => r.created).length;
    assert.equal(createdCount, 1, "exactly one atomic claim wins");
    assert.equal(a.record.id, b.record.id, "both callers see the same row");
  });

  it("replay returns the saved result, never a new claim", async () => {
    const store = createPostgresBulkOperationStore(q);
    const input = {
      actorId: "actor-2",
      operation: "republish" as const,
      idempotencyKey: "k-replay",
      proposalDigest: "d2",
      targetImage: [{ id: "l-2", verdict: "owned" as const }],
      leaseMs: LEASE,
      nowMs: 2_000,
    };
    const first = await store.tryClaimOperation(input);
    assert.equal(first.created, true);
    await store.markState(first.record.id, "PENDING", "EXECUTING", { nowMs: 2_001 });
    await store.completeOperationAtomically({
      operationId: first.record.id,
      executor: "confirm",
      expectedToken: first.record.executionToken!,
      fromStates: ["EXECUTING"],
      to: "COMPLETED",
      resultJson: { outcomes: [{ id: "l-2", status: "success" }], state: "COMPLETED" },
      items: [{ listingId: "l-2", state: "APPLIED", outcome: "success", detail: "republished", appliedAt: 2_002 }],
      audit: [],
      nowMs: 2_002,
    });

    const replay = await store.tryClaimOperation(input);
    assert.equal(replay.created, false);
    assert.equal(replay.record.state, "COMPLETED");
    assert.deepEqual(
      (replay.record.resultJson as { outcomes: unknown[] }).outcomes,
      [{ id: "l-2", status: "success" }]
    );
  });

  it("CAS transitions reject stale states", async () => {
    const store = createPostgresBulkOperationStore(q);
    const claim = await store.tryClaimOperation({
      actorId: "actor-3",
      operation: "hide" as const,
      idempotencyKey: "k-cas",
      proposalDigest: "d3",
      targetImage: [{ id: "l-3", verdict: "owned" as const }],
      leaseMs: LEASE,
      nowMs: 3_000,
    });
    assert.equal(claim.created, true);
    const ok = await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: 3_001 });
    assert.equal(ok.updated, true);
    const stale = await store.markState(claim.record.id, "PENDING", "COMPLETED", { nowMs: 3_002 });
    assert.equal(stale.updated, false);
    assert.equal(stale.record.state, "EXECUTING");
  });

  it("recovery claim is CAS: exactly one winner; the lease blocks healthy executes", async () => {
    const store = createPostgresBulkOperationStore(q);
    const claim = await store.tryClaimOperation({
      actorId: "actor-6",
      operation: "hide" as const,
      idempotencyKey: "k-rec",
      proposalDigest: "d6",
      targetImage: [{ id: "l-6", verdict: "owned" as const }],
      leaseMs: LEASE,
      nowMs: 6_000,
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: 6_001, leaseMs: LEASE });

    // Fresh lease — recovery cannot claim.
    const blocked = await store.tryClaimRecovery({
      operationId: claim.record.id,
      claimableStates: ["PENDING", "EXECUTING", "RECOVERING", "FAILED", "RECOVERY_REQUIRED"],
      leaseMs: 120_000,
      token: "t1",
      nowMs: 6_002,
    });
    assert.equal(blocked.claimed, false);
    assert.equal(blocked.record.state, "EXECUTING");

    // Lease expired — two parallel recoveries, exactly one wins.
    const [a, b] = await Promise.all([
      store.tryClaimRecovery({
        operationId: claim.record.id,
        claimableStates: ["EXECUTING", "RECOVERING", "FAILED", "RECOVERY_REQUIRED"],
        leaseMs: 120_000,
        token: "tA",
        nowMs: 40_000,
      }),
      store.tryClaimRecovery({
        operationId: claim.record.id,
        claimableStates: ["EXECUTING", "RECOVERING", "FAILED", "RECOVERY_REQUIRED"],
        leaseMs: 120_000,
        token: "tB",
        nowMs: 40_000,
      }),
    ]);
    assert.equal([a, b].filter((r) => r.claimed).length, 1, "exactly one recovery claim wins");
    const winner = [a, b].find((r) => r.claimed)!;
    assert.equal(winner.record.state, "RECOVERING");
    assert.ok(winner.record.recoveryToken === "tA" || winner.record.recoveryToken === "tB");
    assert.equal(winner.record.executionToken, null, "takeover fences the old confirm worker (execution_token NULLed)");
  });

  it("atomic terminalization: a failing audit insert rolls the whole commit back", async () => {
    const store = createPostgresBulkOperationStore(q);
    const claim = await store.tryClaimOperation({
      actorId: "actor-7",
      operation: "hide" as const,
      idempotencyKey: "k-atomic",
      proposalDigest: "d7",
      targetImage: [{ id: "l-7", verdict: "owned" as const }],
      leaseMs: LEASE,
      nowMs: 7_000,
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: 7_001 });

    let threw = false;
    try {
      await store.completeOperationAtomically({
        operationId: claim.record.id,
        executor: "confirm",
        expectedToken: claim.record.executionToken!,
        fromStates: ["EXECUTING"],
        to: "COMPLETED",
        resultJson: { outcomes: [{ id: "l-7", status: "success" }], state: "COMPLETED" },
        items: [{ listingId: "l-7", state: "APPLIED", outcome: "success", detail: "hidden", appliedAt: 7_002 }],
        audit: [
          {
            operationId: claim.record.id,
            actorId: "actor-7",
            action: "bulk:hide",
            targetId: "l-7",
            proposalDigest: "d7",
            correlation: "k-atomic",
            outcome: "success",
            timestamp: 7_002,
          },
          // NOT NULL violation on purpose — the second audit row has no actor.
          {
            operationId: claim.record.id,
            actorId: null as unknown as string,
            action: "bulk:hide",
            targetId: "l-7",
            proposalDigest: "d7",
            correlation: "k-atomic",
            outcome: "success",
            timestamp: 7_002,
          },
        ],
        nowMs: 7_002,
      });
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "the transactional method must fail");
    const afterCrash = await store.getOperation({ actorId: "actor-7", operation: "hide", idempotencyKey: "k-atomic" });
    assert.equal(afterCrash!.state, "EXECUTING", "no terminal state without results + audit");
    assert.deepEqual(await store.getItems(claim.record.id), [], "items rolled back too");
  });

  it("per-item persistence + append-only audit survive re-reads", async () => {
    const store = createPostgresBulkOperationStore(q);
    const claim = await store.tryClaimOperation({
      actorId: "actor-4",
      operation: "hide" as const,
      idempotencyKey: "k-items",
      proposalDigest: "d4",
      targetImage: [
        { id: "l-4", verdict: "owned" as const },
        { id: "l-foreign", verdict: "foreign" as const },
      ],
      leaseMs: LEASE,
      nowMs: 4_000,
    });
    assert.equal(claim.created, true);
    await store.saveItemResult({
      operationId: claim.record.id,
      listingId: "l-4",
      state: "APPLIED",
      outcome: "success",
      detail: "hidden",
      appliedAt: 4_001,
    });
    await store.appendAudit([
      {
        operationId: claim.record.id,
        actorId: "actor-4",
        action: "bulk:hide",
        targetId: "l-foreign",
        proposalDigest: "d4",
        correlation: "k-items",
        outcome: "failed:not_owned",
        timestamp: 4_001,
      },
    ]);
    const items = await store.getItems(claim.record.id);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.listingId, "l-4");
    assert.equal(items[0]!.state, "APPLIED");
    assert.equal(items[0]!.outcome, "success");
  });

  it("foreign targets are never materialized as items (no foreign data disclosure)", async () => {
    const store = createPostgresBulkOperationStore(q);
    const claim = await store.tryClaimOperation({
      actorId: "actor-5",
      operation: "hide" as const,
      idempotencyKey: "k-foreign",
      proposalDigest: "d5",
      targetImage: [
        { id: "l-5", verdict: "owned" as const },
        { id: "l-foreign", verdict: "foreign" as const },
      ],
      leaseMs: LEASE,
      nowMs: 5_000,
    });
    assert.equal(claim.created, true);
    const items = await store.getItems(claim.record.id);
    assert.equal(items.length, 0, "foreign targets only live in the operation's target image, never as item rows");
    assert.deepEqual(
      claim.record.targetImage.map((t) => t.verdict),
      ["owned", "foreign"]
    );
  });

  it("fenceBeforeApply atomically verifies token+state and renews the lease", async () => {
    const store = createPostgresBulkOperationStore(q);
    const claim = await store.tryClaimOperation({
      actorId: "actor-8",
      operation: "hide" as const,
      idempotencyKey: "k-fence",
      proposalDigest: "d8",
      targetImage: [{ id: "l-8", verdict: "owned" as const }],
      leaseMs: LEASE,
      nowMs: 8_000,
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: 8_001, leaseMs: LEASE });

    // A fence far past the original lease renews it (long batch stays healthy).
    const fenced = await store.fenceBeforeApply({
      operationId: claim.record.id,
      executor: "confirm",
      token: claim.record.executionToken!,
      leaseMs: LEASE,
      nowMs: 8_000 + LEASE + 5_000,
    });
    assert.equal(fenced.ok, true);
    const renewed = await store.getOperation({ actorId: "actor-8", operation: "hide", idempotencyKey: "k-fence" });
    assert.ok(renewed!.leaseUntil! > 8_000 + LEASE + 5_000, "lease was renewed by the fence");

    // A WRONG token (stale worker) fails the fence.
    const wrong = await store.fenceBeforeApply({
      operationId: claim.record.id,
      executor: "confirm",
      token: "stale-token",
      leaseMs: LEASE,
      nowMs: 9_000,
    });
    assert.equal(wrong.ok, false);

    // After a recovery takeover the confirm fence fails even with the old
    // (correct) token — the token was invalidated by the claim.
    await store.markState(claim.record.id, "EXECUTING", "EXECUTING", { nowMs: 50_000, leaseMs: -1 });
    const takeover = await store.tryClaimRecovery({
      operationId: claim.record.id,
      claimableStates: ["EXECUTING", "RECOVERING", "FAILED", "RECOVERY_REQUIRED"],
      leaseMs: 120_000,
      token: "rec-token",
      nowMs: 50_001,
    });
    assert.equal(takeover.claimed, true);
    const fencedOut = await store.fenceBeforeApply({
      operationId: claim.record.id,
      executor: "confirm",
      token: claim.record.executionToken!,
      leaseMs: LEASE,
      nowMs: 50_002,
    });
    assert.equal(fencedOut.ok, false, "a taken-over confirm worker can no longer fence");
  });

  it("a wrong or stale token can never terminalize", async () => {
    const store = createPostgresBulkOperationStore(q);
    const claim = await store.tryClaimOperation({
      actorId: "actor-9",
      operation: "hide" as const,
      idempotencyKey: "k-stale-complete",
      proposalDigest: "d9",
      targetImage: [{ id: "l-9", verdict: "owned" as const }],
      leaseMs: LEASE,
      nowMs: 9_000,
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: 9_001 });

    const wrongToken = await store.completeOperationAtomically({
      operationId: claim.record.id,
      executor: "confirm",
      expectedToken: "wrong-token",
      fromStates: ["EXECUTING"],
      to: "COMPLETED",
      resultJson: { outcomes: [], state: "COMPLETED" },
      items: [],
      audit: [],
      nowMs: 9_002,
    });
    assert.equal(wrongToken.updated, false, "stale token must not terminalize");

    const staleExecutor = await store.completeOperationAtomically({
      operationId: claim.record.id,
      executor: "recovery",
      expectedToken: claim.record.executionToken!,
      fromStates: ["RECOVERING"],
      to: "COMPLETED",
      resultJson: { outcomes: [], state: "COMPLETED" },
      items: [],
      audit: [],
      nowMs: 9_003,
    });
    assert.equal(staleExecutor.updated, false, "wrong executor/token pair must not terminalize");
    const still = await store.getOperation({ actorId: "actor-9", operation: "hide", idempotencyKey: "k-stale-complete" });
    assert.equal(still!.state, "EXECUTING");
  });

  it("a confirm can NEVER terminalize from RECOVERING", async () => {
    const store = createPostgresBulkOperationStore(q);
    const claim = await store.tryClaimOperation({
      actorId: "actor-10",
      operation: "hide" as const,
      idempotencyKey: "k-confirm-from-recovering",
      proposalDigest: "d10",
      targetImage: [{ id: "l-10", verdict: "owned" as const }],
      leaseMs: LEASE,
      nowMs: 10_000,
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: 10_001, leaseMs: -1 });
    const takeover = await store.tryClaimRecovery({
      operationId: claim.record.id,
      claimableStates: ["EXECUTING", "RECOVERING", "FAILED", "RECOVERY_REQUIRED"],
      leaseMs: 120_000,
      token: "rec-token-2",
      nowMs: 10_002,
    });
    assert.equal(takeover.claimed, true);
    assert.equal(takeover.record.state, "RECOVERING");

    // The old confirm worker, still holding its execution token, tries to
    // terminalize: the state is RECOVERING and the execution token is NULL —
    // the CAS rejects it on BOTH axes.
    const rejected = await store.completeOperationAtomically({
      operationId: claim.record.id,
      executor: "confirm",
      expectedToken: claim.record.executionToken!,
      fromStates: ["EXECUTING", "RECOVERING"],
      to: "COMPLETED",
      resultJson: { outcomes: [], state: "COMPLETED" },
      items: [],
      audit: [],
      nowMs: 10_003,
    });
    assert.equal(rejected.updated, false, "confirm cannot terminalize a RECOVERING operation");
    const after = await store.getOperation({ actorId: "actor-10", operation: "hide", idempotencyKey: "k-confirm-from-recovering" });
    assert.equal(after!.state, "RECOVERING");
  });

  it("recovery A loses its lease to recovery B: A can no longer fence or terminalize", async () => {
    const store = createPostgresBulkOperationStore(q);
    const claim = await store.tryClaimOperation({
      actorId: "actor-11",
      operation: "republish" as const,
      idempotencyKey: "k-rec-takeover",
      proposalDigest: "d11",
      targetImage: [{ id: "l-11", verdict: "owned" as const }],
      leaseMs: LEASE,
      nowMs: 11_000,
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: 11_001, leaseMs: -1 });
    const claimA = await store.tryClaimRecovery({
      operationId: claim.record.id,
      claimableStates: ["EXECUTING", "RECOVERING", "FAILED", "RECOVERY_REQUIRED"],
      leaseMs: 60_000,
      token: "rec-A",
      nowMs: 11_002,
    });
    assert.equal(claimA.claimed, true);

    // A's lease expires; B claims.
    const claimB = await store.tryClaimRecovery({
      operationId: claim.record.id,
      claimableStates: ["RECOVERING"],
      leaseMs: 60_000,
      token: "rec-B",
      nowMs: 11_002 + 60_000 + 1,
    });
    assert.equal(claimB.claimed, true);
    assert.equal(claimB.record.recoveryToken, "rec-B");

    // A (stale token) can no longer fence…
    const aFence = await store.fenceBeforeApply({
      operationId: claim.record.id,
      executor: "recovery",
      token: "rec-A",
      leaseMs: 60_000,
      nowMs: 11_002 + 60_000 + 2,
    });
    assert.equal(aFence.ok, false, "stale recovery A cannot fence after B took over");

    // …and cannot terminalize.
    const aComplete = await store.completeOperationAtomically({
      operationId: claim.record.id,
      executor: "recovery",
      expectedToken: "rec-A",
      fromStates: ["RECOVERING"],
      to: "COMPLETED",
      resultJson: { outcomes: [{ id: "l-11", status: "success" }], state: "COMPLETED" },
      items: [{ listingId: "l-11", state: "APPLIED", outcome: "success", detail: null, appliedAt: 11_003 }],
      audit: [],
      nowMs: 11_002 + 60_000 + 3,
    });
    assert.equal(aComplete.updated, false, "stale recovery A cannot terminalize");

    // B terminalizes fine.
    const bComplete = await store.completeOperationAtomically({
      operationId: claim.record.id,
      executor: "recovery",
      expectedToken: "rec-B",
      fromStates: ["RECOVERING"],
      to: "COMPLETED",
      resultJson: { outcomes: [{ id: "l-11", status: "success" }], state: "COMPLETED" },
      items: [{ listingId: "l-11", state: "APPLIED", outcome: "success", detail: null, appliedAt: 11_003 }],
      audit: [],
      nowMs: 11_002 + 60_000 + 4,
    });
    assert.equal(bComplete.updated, true);
    const final = await store.getOperation({ actorId: "actor-11", operation: "republish", idempotencyKey: "k-rec-takeover" });
    assert.equal(final!.state, "COMPLETED");
  });
});
