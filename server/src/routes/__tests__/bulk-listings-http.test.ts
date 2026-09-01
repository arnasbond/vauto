/**
 * F6.1 — professional seller bulk listing control.
 *
 * Real Express router (preview → human confirmation → execution) with the
 * same test harness as the consequential-action HTTP suite: auth middleware
 * for real, executors faked, no PostgreSQL touched.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth } from "../../middleware/auth.js";
import {
  bulkListingsRouter,
  setBulkExecutorsForTests,
} from "../bulk-listings.js";
import {
  buildBulkProposal,
  canRunBulkOperations,
  classifyBulkTargets,
  executeBulkOperation,
} from "../../ai/bulk-listing-control.js";

const ACTOR = "seller-pro-1";

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

  it("proposal digest is deterministic per canonical payload; tampering fails", async () => {
    const first = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-2", "l-1"],
      operation: "unpublish",
      signingKey: "test-key",
      nowMs: 1_000,
    });
    const same = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1", "l-2"],
      operation: "unpublish",
      signingKey: "test-key",
      nowMs: 1_000,
    });
    assert.equal(first.digest, same.digest, "order-insensitive canonical digest");

    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "unpublish",
      targetIds: ["l-1", "l-2"],
      digest: "00".repeat(32),
      proposalExpiresAt: 2_000,
      idempotencyKey: "k1",
      signingKey: "test-key",
      executedKeys: new Set(),
      nowMs: 1_100,
      applyItem: async () => ({ ok: true }),
      resolveListings: async () => ROWS,
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, "tampered");
  });

  it("expired proposal is rejected", async () => {
    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "unpublish",
      targetIds: ["l-1"],
      digest: "aa",
      proposalExpiresAt: 1_000,
      idempotencyKey: "k1",
      signingKey: "test-key",
      executedKeys: new Set(),
      nowMs: 2_000,
      applyItem: async () => ({ ok: true }),
      resolveListings: async () => ROWS,
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, "expired");
  });

  it("idempotency: the same key executes exactly once", async () => {
    const applied: string[] = [];
    const keys = new Set<string>();
    const minted = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1"],
      operation: "unpublish",
      signingKey: "test-key",
      nowMs: 500,
    });
    const base = {
      actorId: ACTOR,
      actorRole: "pro" as const,
      operation: "unpublish" as const,
      targetIds: ["l-1"],
      proposalExpiresAt: minted.proposal.expiresAt,
      signingKey: "test-key",
      executedKeys: keys,
      nowMs: 1_000,
      applyItem: async (id: string) => {
        applied.push(id);
        return { ok: true };
      },
      resolveListings: async () => ROWS,
    };

    const first = await executeBulkOperation({ ...base, digest: minted.digest, idempotencyKey: "k-same" });
    const second = await executeBulkOperation({ ...base, digest: minted.digest, idempotencyKey: "k-same" });
    assert.equal(first.ok, true);
    assert.deepEqual(applied, ["l-1"], "applied exactly once");
    const secondOk = second as { ok: true; outcomes: { status: string; reason: string }[]; executed: boolean };
    assert.equal(secondOk.ok, true);
    assert.equal(secondOk.outcomes[0]!.status, "skipped");
    assert.equal(secondOk.outcomes[0]!.reason, "duplicate_request");
    assert.equal(secondOk.executed, false);
  });

  it("partial failure never hides already-applied results; foreign targets fail closed", async () => {
    const keys = new Set<string>();
    const minted = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1", "l-3"],
      operation: "delete",
      signingKey: "test-key",
      nowMs: 500,
    });

    const result = await executeBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "delete",
      targetIds: ["l-1", "l-3", "l-foreign"],
      digest: minted.digest,
      proposalExpiresAt: minted.proposal.expiresAt,
      idempotencyKey: "k-partial",
      signingKey: "test-key",
      executedKeys: keys,
      nowMs: 1_000,
      applyItem: async (id) => (id === "l-3" ? { ok: false, detail: "db_locked" } : { ok: true }),
      resolveListings: async () => ROWS,
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
  });

  it("preview lists own items; foreign ids surface as warnings, never executable", async () => {
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
    const res = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1", "l-foreign"], operation: "unpublish" });
    assert.equal(res.status, 200);
    assert.ok(res.body.digest);
    assert.equal(res.body.proposal.ownedCount, 1);
    assert.ok(res.body.proposal.warnings.some((w: string) => w.includes("Svetimas")));
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
        operation: "unpublish",
        listingIds: ["l-1"],
        idempotencyKey: "k-http-1",
      });
    assert.equal(res.status, 409);
    assert.equal(applied, 0, "no execution without the minted digest");
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
      .send({ listingIds: ["l-1", "l-2"], operation: "unpublish" });
    assert.equal(preview.status, 200);

    const confirm = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "unpublish",
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
        operation: "unpublish",
        listingIds: ["l-1", "l-2"],
        idempotencyKey: "k-http-full",
      });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.executed, false);
    assert.ok(replay.body.outcomes.every((o: { status: string }) => o.status === "skipped"));
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
      .send({ listingIds: ["l-1"], operation: "delete" });
    const res = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: Date.now() - 1_000,
        operation: "delete",
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
      .send({ listingIds: ["l-1"], operation: "unpublish" });
    const res = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader("other-seller", "pro"))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "unpublish",
        listingIds: ["l-1"],
        idempotencyKey: "k-forged",
      });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "tampered");
  });

  it("consumer/unknown roles are rejected (403); no preview or execution", async () => {
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR, "private"))
      .send({ listingIds: ["l-1"], operation: "unpublish" });
    assert.equal(preview.status, 403);

    const confirm = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR, "buyer"))
      .send({ digest: "x", proposalExpiresAt: 1, operation: "unpublish", listingIds: ["l-1"], idempotencyKey: "k" });
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
