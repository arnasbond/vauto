/**
 * F6.2 — durable bulk store against a REAL PostgreSQL-compatible engine
 * (PGlite): atomic claim via the unique constraint, replay reads the saved
 * result, CAS state transitions, per-item persistence and append-only audit.
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
  return {
    async query<T extends Record<string, unknown>>(text: string, params?: unknown[]) {
      const res = await db.query(text, params as never[]);
      return { rows: res.rows as T[] };
    },
  };
}

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../../../migrations/064_f6_bulk_operations.sql"),
  "utf8"
);

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
      nowMs: 2_000,
    };
    const first = await store.tryClaimOperation(input);
    assert.equal(first.created, true);
    await store.markState(first.record.id, "PENDING", "EXECUTING", { nowMs: 2_001 });
    await store.saveOutcomes({
      operationId: first.record.id,
      from: "EXECUTING",
      to: "COMPLETED",
      resultJson: { outcomes: [{ id: "l-2", status: "success" }], state: "COMPLETED" },
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
      nowMs: 3_000,
    });
    assert.equal(claim.created, true);
    const ok = await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: 3_001 });
    assert.equal(ok.updated, true);
    const stale = await store.markState(claim.record.id, "PENDING", "COMPLETED", { nowMs: 3_002 });
    assert.equal(stale.updated, false);
    assert.equal(stale.record.state, "EXECUTING");
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
