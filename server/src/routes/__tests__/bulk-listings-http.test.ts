/**
 * F6.1 — professional seller bulk listing control.
 *
 * Real Express router (preview → human confirmation → execution) with the
 * same test harness as the consequential-action HTTP suite: auth middleware
 * for real, executors faked, no PostgreSQL touched.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth } from "../../middleware/auth.js";
import {
  bulkListingsRouter,
  setBulkExecutorsForTests,
  setBulkStoreForTests,
} from "../bulk-listings.js";
import { createInMemoryBulkOperationStore } from "../../ai/bulk/bulk-store.js";
import {
  BULK_OPERATIONS,
  buildBulkProposal,
  bulkExecutionEnabled,
  canRunBulkOperations,
  classifyBulkTargets,
  executeBulkOperation,
  validateBulkTargetIds,
} from "../../ai/bulk-listing-control.js";

const ACTOR = "seller-pro-1";
const OTHER = "seller-pro-2";

const ROWS = [
  { id: "l-1", sellerId: ACTOR, title: "Volvo V70", category: "vehicles", status: "active" },
  { id: "l-2", sellerId: ACTOR, title: "Butas Vilniuje", category: "real_estate", status: "active" },
  { id: "l-3", sellerId: ACTOR, title: "iPhone 13", category: "electronics", status: "active" },
  { id: "l-4", sellerId: ACTOR, title: "Nike kedai", category: "clothing", status: "active" },
  { id: "l-5", sellerId: ACTOR, title: "Sofa kampinė", category: "home", status: "active" },
  { id: "l-6", sellerId: ACTOR, title: "Santechnikos paslaugos", category: "services", status: "active" },
  { id: "l-7", sellerId: ACTOR, title: "Vairuotojo darbo skelbimas", category: "jobs", status: "active" },
  { id: "l-foreign", sellerId: "other-seller", title: "Svetimas", category: "home", status: "active" },
];

function createApp() {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use(optionalAuth);
  app.use("/api/bulk-listings", bulkListingsRouter);
  return app;
}

function authHeader(userId: string, role = "pro") {
  return `Bearer ${signAccessToken({ sub: userId, role, provider: "phone" })}`;
}

const app = createApp();

const SAVED_ENV = { NODE_ENV: process.env.NODE_ENV, VAUTO_ENABLE_BULK_LISTING_OPS: process.env.VAUTO_ENABLE_BULK_LISTING_OPS };

afterEach(() => {
  setBulkExecutorsForTests(null);
  setBulkStoreForTests(null);
  if (SAVED_ENV.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = SAVED_ENV.NODE_ENV;
  if (SAVED_ENV.VAUTO_ENABLE_BULK_LISTING_OPS === undefined) delete process.env.VAUTO_ENABLE_BULK_LISTING_OPS;
  else process.env.VAUTO_ENABLE_BULK_LISTING_OPS = SAVED_ENV.VAUTO_ENABLE_BULK_LISTING_OPS;
});

describe("F6.1 — bulk-listing core (pure)", () => {
  it("role gate: only pro/admin/super_admin may run bulk operations", () => {
    assert.equal(canRunBulkOperations("pro"), true);
    assert.equal(canRunBulkOperations("admin"), true);
    assert.equal(canRunBulkOperations("super_admin"), true);
    assert.equal(canRunBulkOperations("private"), false);
    assert.equal(canRunBulkOperations("buyer"), false);
    assert.equal(canRunBulkOperations(undefined), false);
    assert.equal(canRunBulkOperations("hacker"), false);
  });

  it("operation vocabulary is precise: hide + republish only (no aliases)", () => {
    assert.deepEqual([...BULK_OPERATIONS], ["hide", "republish"]);
    assert.ok(!(BULK_OPERATIONS as readonly string[]).includes("unpublish"));
    assert.ok(!(BULK_OPERATIONS as readonly string[]).includes("delete"));
  });

  it("feature gate: production is fail-closed without the explicit opt-in", () => {
    assert.equal(bulkExecutionEnabled({ NODE_ENV: "production" }), false);
    assert.equal(bulkExecutionEnabled({ NODE_ENV: "production", VAUTO_ENABLE_BULK_LISTING_OPS: "true" }), true);
    assert.equal(bulkExecutionEnabled({ NODE_ENV: "production", VAUTO_ENABLE_BULK_LISTING_OPS: "1" }), false);
    assert.equal(bulkExecutionEnabled({}), true, "non-production stays enabled");
  });

  it("canonical validation: duplicates, empty, non-string, whitespace, >100 chars → invalid", () => {
    assert.equal(validateBulkTargetIds(["l-1", "l-1"]).ok, false, "duplicates");
    assert.equal(validateBulkTargetIds([]).ok, false, "empty");
    assert.equal(validateBulkTargetIds(["  "]).ok, false, "whitespace-only");
    assert.equal(validateBulkTargetIds([42]).ok, false, "number");
    assert.equal(validateBulkTargetIds([null]).ok, false, "null");
    assert.equal(validateBulkTargetIds([{ id: "l-1" }]).ok, false, "object");
    assert.equal(validateBulkTargetIds(["x".repeat(101)]).ok, false, "too long");
    assert.equal(validateBulkTargetIds("l-1" as unknown as string[]).ok, false, "non-array");

    const ok = validateBulkTargetIds(["l-2", " l-1 "]);
    assert.equal(ok.ok, true);
    assert.deepEqual((ok as { ok: true; ids: string[] }).ids, ["l-1", "l-2"], "canonical trim + sort order");
  });

  it("duplicate ids in confirm never execute twice (400 invalid_payload)", async () => {
    let applied = 0;
    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      targetIds: ["l-1", "l-1"],
      digest: "aa",
      proposalExpiresAt: 9_999_999,
      idempotencyKey: "k-dup",
      signingKey: "test-key",
      executedKeys: new Set(),
      nowMs: 600,
      applyItem: async () => {
        applied += 1;
        return { ok: true };
      },
      resolveListings: async () => ROWS,
      env: {},
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, "invalid_payload");
    assert.equal(applied, 0, "zero apply");
  });

  it("a canonical set applies each id exactly once", async () => {
    const applied: string[] = [];
    const minted = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1", "l-2", "l-3"],
      operation: "hide",
      signingKey: "test-key",
      nowMs: 500,
    });
    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      targetIds: ["l-3", "l-1", "l-2"],
      digest: minted.digest,
      proposalExpiresAt: minted.proposal.expiresAt,
      idempotencyKey: "k-once",
      signingKey: "test-key",
      executedKeys: new Set(),
      nowMs: 600,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
      resolveListings: async () => ROWS,
      env: {},
    });
    assert.equal(result.ok, true);
    assert.equal(applied.length, 3, "each canonical id applied exactly once");
    assert.equal(new Set(applied).size, 3, "no duplicates applied");
  });

  it("classification: owned / foreign / not_found / invalid, fail-closed", () => {
    const { verdicts, ownedIds } = classifyBulkTargets({
      actorId: ACTOR,
      listings: [
        ...ROWS,
        { id: "l-banned", sellerId: ACTOR, banned: true },
      ],
      requestedIds: ["l-1", "l-foreign", "l-missing", "l-banned"],
    });
    assert.deepEqual(ownedIds, ["l-1"]);
    assert.equal(verdicts.find((v) => v.listingId === "l-1")!.status, "owned");
    assert.equal(verdicts.find((v) => v.listingId === "l-foreign")!.status, "foreign");
    assert.equal(verdicts.find((v) => v.listingId === "l-missing")!.status, "not_found");
    assert.equal(verdicts.find((v) => v.listingId === "l-banned")!.status, "invalid");
  });

  it("digest covers the FULL proposal image: added, removed or changed targets → tampered", async () => {
    const minted = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1", "l-2"],
      operation: "hide",
      signingKey: "test-key",
      nowMs: 500,
    });
    let applied = 0;
    const base = {
      actorId: ACTOR,
      actorRole: "pro" as const,
      operation: "hide" as const,
      proposalExpiresAt: minted.proposal.expiresAt,
      idempotencyKey: "k",
      signingKey: "test-key",
      executedKeys: new Set<string>(),
      nowMs: 600,
      applyItem: async () => {
        applied += 1;
        return { ok: true };
      },
      resolveListings: async () => ROWS,
      env: {},
    };

    const added = await executeBulkOperation({ ...base, targetIds: ["l-1", "l-2", "l-foreign"], digest: minted.digest });
    assert.equal(added.ok, false);
    assert.equal((added as { code: string }).code, "tampered");

    const removed = await executeBulkOperation({ ...base, targetIds: ["l-1"], digest: minted.digest });
    assert.equal(removed.ok, false);
    assert.equal((removed as { code: string }).code, "tampered");

    const changed = await executeBulkOperation({ ...base, targetIds: ["l-1", "l-3"], digest: minted.digest });
    assert.equal(changed.ok, false);
    assert.equal((changed as { code: string }).code, "tampered");

    assert.equal(applied, 0, "zero execution on any proposal change");
  });

  it("canonical ordering: the same set in a different order executes", async () => {
    const minted = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1", "l-2"],
      operation: "hide",
      signingKey: "test-key",
      nowMs: 500,
    });
    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      targetIds: ["l-2", "l-1"],
      digest: minted.digest,
      proposalExpiresAt: minted.proposal.expiresAt,
      idempotencyKey: "k-order",
      signingKey: "test-key",
      executedKeys: new Set(),
      nowMs: 600,
      applyItem: async () => ({ ok: true }),
      resolveListings: async () => ROWS,
      env: {},
    });
    assert.equal(result.ok, true);
  });

  it("expired proposal is rejected", async () => {
    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      targetIds: ["l-1"],
      digest: "aa",
      proposalExpiresAt: 1_000,
      idempotencyKey: "k1",
      signingKey: "test-key",
      executedKeys: new Set(),
      nowMs: 2_000,
      applyItem: async () => ({ ok: true }),
      resolveListings: async () => ROWS,
      env: {},
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, "expired");
  });

  it("more than 100 targets is rejected with too_many, never silently truncated", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `l-${i}`);
    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      targetIds: ids,
      digest: "aa",
      proposalExpiresAt: 9_999_999,
      idempotencyKey: "k-many",
      signingKey: "test-key",
      executedKeys: new Set(),
      nowMs: 1_000,
      applyItem: async () => ({ ok: true }),
      resolveListings: async () => ROWS,
      env: {},
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, "too_many");
  });

  it("production without the opt-in fails closed (disabled)", async () => {
    const minted = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1"],
      operation: "hide",
      signingKey: "test-key",
      nowMs: 500,
    });
    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      targetIds: ["l-1"],
      digest: minted.digest,
      proposalExpiresAt: minted.proposal.expiresAt,
      idempotencyKey: "k-gate",
      signingKey: "test-key",
      executedKeys: new Set(),
      nowMs: 600,
      applyItem: async () => ({ ok: true }),
      resolveListings: async () => ROWS,
      env: { NODE_ENV: "production" },
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, "disabled");
  });

  it("idempotency is scoped per actor + operation + key — sellers never block each other", async () => {
    const keys = new Set<string>();
    const makeProposal = (actorId: string, id: string) =>
      buildBulkProposal({
        actorId,
        listings: [
          ...ROWS,
          { id, sellerId: actorId, title: "X", category: "home", status: "active" },
        ],
        requestedIds: [id],
        operation: "hide",
        signingKey: "test-key",
        nowMs: 500,
      });
    const run = async (actorId: string, id: string) => {
      const minted = makeProposal(actorId, id);
      return executeBulkOperation({
        actorId,
        actorRole: "pro",
        operation: "hide",
        targetIds: [id],
        digest: minted.digest,
        proposalExpiresAt: minted.proposal.expiresAt,
        idempotencyKey: "same-key",
        signingKey: "test-key",
        executedKeys: keys,
        nowMs: 600,
        applyItem: async () => ({ ok: true }),
        resolveListings: async () => [
          ...ROWS,
          { id, sellerId: actorId, title: "X", category: "home", status: "active" },
        ],
        env: {},
      });
    };
    const a1 = await run(ACTOR, "l-a");
    const b1 = await run(OTHER, "l-b");
    assert.equal(a1.ok, true);
    assert.equal(b1.ok, true, "different actor with the same key is not blocked");
    assert.equal((a1 as { executed: boolean }).executed, true);
    assert.equal((b1 as { executed: boolean }).executed, true);

    const a2 = await run(ACTOR, "l-a");
    assert.equal((a2 as { ok: true; executed: boolean }).executed, false, "same actor replay is skipped");
  });

  it("partial failure never hides already-applied results; foreign targets fail closed", async () => {
    const keys = new Set<string>();
    const minted = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1", "l-3", "l-foreign"],
      operation: "hide",
      signingKey: "test-key",
      nowMs: 500,
    });

    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      targetIds: ["l-1", "l-3", "l-foreign"],
      digest: minted.digest,
      proposalExpiresAt: minted.proposal.expiresAt,
      idempotencyKey: "k-partial",
      signingKey: "test-key",
      executedKeys: keys,
      nowMs: 600,
      applyItem: async (id) => (id === "l-3" ? { ok: false, detail: "db_locked" } : { ok: true }),
      resolveListings: async () => ROWS,
      env: {},
    });
    assert.equal(result.ok, true);
    const outcomes = (result as { ok: true; outcomes: { id: string; status: string; reason?: string }[] }).outcomes;
    assert.equal(outcomes.find((o) => o.id === "l-1")!.status, "success");
    assert.equal(outcomes.find((o) => o.id === "l-3")!.status, "failed");
    assert.equal(outcomes.find((o) => o.id === "l-foreign")!.status, "failed");
    assert.equal(outcomes.find((o) => o.id === "l-foreign")!.reason, "not_owned");
  });
});

describe("F6.1 — bulk-listing HTTP boundary (preview → confirm)", () => {
  beforeEach(() => {
    setBulkExecutorsForTests(null);
    setBulkStoreForTests(createInMemoryBulkOperationStore());
  });

  it("preview lists own items; foreign ids surface as warnings, never executable", async () => {
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
    const res = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1", "l-foreign"], operation: "hide" });
    assert.equal(res.status, 200);
    assert.ok(res.body.digest);
    assert.equal(res.body.executionEnabled, true);
    assert.equal(res.body.proposal.ownedCount, 1);
    assert.ok(res.body.proposal.warnings.some((w: string) => w.includes("Svetimas")));
  });

  it("production gate: preview promises nothing, mints no digest, confirm is 403", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VAUTO_ENABLE_BULK_LISTING_OPS;
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1"], operation: "hide" });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.executionEnabled, false);
    assert.equal(preview.body.digest, null);
    assert.ok(preview.body.proposal.warnings.some((w: string) => w.includes("išjungtas")));

    const confirm = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: "aa",
        proposalExpiresAt: Date.now() + 60_000,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-gate",
      });
    assert.equal(confirm.status, 403);
    assert.equal(confirm.body.code, "disabled");
  });

  it("confirm without a valid human-confirmed digest never executes", async () => {
    let applied = 0;
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => {
        applied += 1;
        return { ok: true };
      },
    });
    const res = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: "00".repeat(32),
        proposalExpiresAt: Date.now() + 60_000,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-http-1",
      });
    assert.equal(res.status, 409);
    assert.equal(applied, 0, "no execution without the minted digest");
  });

  it("adding a foreign id after preview → 409, zero apply", async () => {
    const applied: string[] = [];
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1"], operation: "hide" });
    const res = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1", "l-foreign"],
        idempotencyKey: "k-add",
      });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "tampered");
    assert.deepEqual(applied, [], "zero apply");
  });

  it("removing a target after preview → 409, zero apply", async () => {
    const applied: string[] = [];
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1", "l-2"], operation: "hide" });
    const res = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-remove",
      });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "tampered");
    assert.deepEqual(applied, []);
  });

  it("full flow: preview → confirm executes per-item with audit trail; replay is skipped", async () => {
    const applied: string[] = [];
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
    });

    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1", "l-2"], operation: "hide" });
    assert.equal(preview.status, 200);

    const confirm = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1", "l-2"],
        idempotencyKey: "k-http-full",
      });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.ok, true);
    assert.equal(confirm.body.executed, true);
    assert.deepEqual(
      confirm.body.outcomes.map((o: { status: string }) => o.status),
      ["success", "success"]
    );
    assert.equal(confirm.body.audit.length, 2);
    assert.ok(confirm.body.audit.every((a: { actorId: string }) => a.actorId === ACTOR));
    assert.deepEqual(applied, ["l-1", "l-2"]);

    const replay = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1", "l-2"],
        idempotencyKey: "k-http-full",
      });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.executed, false);
    assert.equal(replay.body.replayed, true, "durable replay returns the saved result");
    assert.deepEqual(
      replay.body.outcomes.map((o: { status: string }) => o.status),
      ["success", "success"],
      "saved outcomes are returned, not a re-execution"
    );
    assert.deepEqual(applied, ["l-1", "l-2"], "no double execution");
  });

  it("expired proposal is rejected (409)", async () => {
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1"], operation: "hide" });
    const res = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: Date.now() - 1_000,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-expired",
      });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "expired");
  });

  it("forged actor (different user confirms another's proposal) is tampered", async () => {
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1"], operation: "hide" });
    const res = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(OTHER))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-forged",
      });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "tampered");
  });

  it("more than 100 confirm target ids → 400, no silent truncation", async () => {
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
    const ids = Array.from({ length: 101 }, (_, i) => `l-${i}`);
    const res = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: "aa",
        proposalExpiresAt: Date.now() + 60_000,
        operation: "hide",
        listingIds: ids,
        idempotencyKey: "k-many",
      });
    assert.equal(res.status, 400);
  });

  it("preview duplicate id → clear 400 invalid_payload", async () => {
    const res = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1", "l-1"], operation: "hide" });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "invalid_payload");
  });

  it("confirm duplicate id → 400, zero apply", async () => {
    const applied: string[] = [];
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
    });
    const res = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: "aa",
        proposalExpiresAt: Date.now() + 60_000,
        operation: "hide",
        listingIds: ["l-1", "l-1"],
        idempotencyKey: "k-dup-http",
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "invalid_payload");
    assert.deepEqual(applied, [], "zero apply");
  });

  it("empty / whitespace-only / non-string / >100-char ids → 400 (preview)", async () => {
    for (const bad of [[], ["  "], [42], [null], ["x".repeat(101)]]) {
      const res = await request(app)
        .post("/api/bulk-listings/preview")
        .set("Authorization", authHeader(ACTOR))
        .send({ listingIds: bad, operation: "hide" });
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.equal(res.body.code, "invalid_payload");
    }
  });

  it("consumer/unknown roles are rejected (403); no preview or execution", async () => {
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR, "private"))
      .send({ listingIds: ["l-1"], operation: "hide" });
    assert.equal(preview.status, 403);

    const confirm = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR, "buyer"))
      .send({ digest: "x", proposalExpiresAt: 1, operation: "hide", listingIds: ["l-1"], idempotencyKey: "k" });
    assert.equal(confirm.status, 403);
  });

  it("manual path works without AI and across all 7 verticals (parametrized)", async () => {
    const applied: string[] = [];
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
    });
    for (const row of ROWS.filter((r) => r.sellerId === ACTOR)) {
      const preview = await request(app)
        .post("/api/bulk-listings/preview")
        .set("Authorization", authHeader(ACTOR))
        .send({ listingIds: [row.id], operation: "republish" });
      assert.equal(preview.status, 200);
      assert.equal(preview.body.proposal.ownedCount, 1, row.category);
      const confirm = await request(app)
        .post("/api/bulk-listings/confirm")
        .set("Authorization", authHeader(ACTOR))
        .send({
          digest: preview.body.digest,
          proposalExpiresAt: preview.body.proposal.expiresAt,
          operation: "republish",
          listingIds: [row.id],
          idempotencyKey: `k-vertical-${row.id}`,
        });
      assert.equal(confirm.status, 200);
      assert.equal(confirm.body.outcomes[0].status, "success", row.category);
    }
    assert.equal(applied.length, 7, "all 7 verticals executed through one path");
  });
});
