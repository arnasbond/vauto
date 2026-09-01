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
});
