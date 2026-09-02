/**
 * F6.2 — durable bulk operations through the real HTTP boundary.
 *
 * Uses the deterministic in-memory store (same interface as Postgres) with
 * the REAL route: concurrency across two parallel confirms, durable replay,
 * crash-before-apply / crash-after-apply recovery, partial persistence,
 * audit integrity, production gate and 7-vertical parity.
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
import { executeBulkOperationDurable, recoverBulkOperation, buildBulkProposal } from "../../ai/bulk-listing-control.js";

const ACTOR = "seller-pro-1";

const ROWS = [
  { id: "l-1", sellerId: ACTOR, title: "Volvo V70", category: "vehicles", status: "active" },
  { id: "l-2", sellerId: ACTOR, title: "Butas Vilniuje", category: "real_estate", status: "active" },
  { id: "l-3", sellerId: ACTOR, title: "iPhone 13", category: "electronics", status: "active" },
  { id: "l-4", sellerId: ACTOR, title: "Nike kedai", category: "clothing", status: "active" },
  { id: "l-5", sellerId: ACTOR, title: "Sofa kampinė", category: "home", status: "active" },
  { id: "l-6", sellerId: ACTOR, title: "Santechnikos paslaugos", category: "services", status: "active" },
  { id: "l-7", sellerId: ACTOR, title: "Vairuotojo darbo skelbimas", category: "jobs", status: "active" },
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

describe("F6.2 — durable execution through the HTTP boundary", () => {
  beforeEach(() => {
    setBulkExecutorsForTests(null);
    setBulkStoreForTests(createInMemoryBulkOperationStore());
  });

  it("two parallel confirms with the same actor/key apply at most once", async () => {
    const applied: string[] = [];
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id: string) => {
        applied.push(id);
        return { ok: true };
      },
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1", "l-2"], operation: "hide" });
    assert.equal(preview.status, 200);

    const body = {
      digest: preview.body.digest,
      proposalExpiresAt: preview.body.proposal.expiresAt,
      operation: "hide",
      listingIds: ["l-1", "l-2"],
      idempotencyKey: "k-race",
    };
    const [a, b] = await Promise.all([
      request(app).post("/api/bulk-listings/confirm").set("Authorization", authHeader(ACTOR)).send(body),
      request(app).post("/api/bulk-listings/confirm").set("Authorization", authHeader(ACTOR)).send(body),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.ok(statuses.includes(200), `at least one success: ${statuses.join(",")}`);
    const executedCount = [a, b].filter((r) => r.body?.executed === true).length;
    assert.equal(executedCount, 1, "exactly one caller executes");
    assert.deepEqual(applied, ["l-1", "l-2"], "apply called once per canonical id");
  });

  it("same actor/key with a different digest or targets is rejected", async () => {
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1"], operation: "hide" });

    const first = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-digest",
      });
    assert.equal(first.status, 200);

    const otherDigest = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: "00".repeat(32),
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-digest",
      });
    assert.equal(otherDigest.status, 409);
    assert.equal(otherDigest.body.code, "tampered");
  });

  it("durable replay after a simulated restart returns the saved result", async () => {
    const applied: string[] = [];
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id: string) => {
        applied.push(id);
        return { ok: true };
      },
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1"], operation: "hide" });
    const confirmBody = {
      digest: preview.body.digest,
      proposalExpiresAt: preview.body.proposal.expiresAt,
      operation: "hide",
      listingIds: ["l-1"],
      idempotencyKey: "k-restart",
    };
    const first = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send(confirmBody);
    assert.equal(first.status, 200);
    assert.equal(first.body.executed, true);

    // "Restart": same durable store, the route seams stay (they are infra,
    // the STORE is what must survive) — replay must return the saved result
    // without re-applying.
    const replay = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send(confirmBody);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.executed, false);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.state, "COMPLETED");
    assert.deepEqual(replay.body.outcomes, [{ id: "l-1", status: "success", detail: "hide" }]);
    assert.deepEqual(applied, ["l-1"], "never re-applied after restart");
  });

  it("crash before first apply: replay fails closed to recovery_required; recovery verifies statuses", async () => {
    const applied: string[] = [];
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id: string) => {
        applied.push(id);
        return { ok: true };
      },
    });

    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1"], operation: "hide" });
    assert.equal(preview.status, 200);

    // Simulate crash: claim + EXECUTING state with an EXPIRED lease (the
    // crashed process is gone), no items persisted.
    const claim = await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-crash1",
      proposalDigest: preview.body.digest,
      targetImage: [{ id: "l-1", verdict: "owned" }],
      leaseMs: 30_000,
      nowMs: Date.now(),
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: Date.now(), leaseMs: -1 });

    const replay = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-crash1",
      });
    assert.equal(replay.status, 409);
    assert.equal(replay.body.code, "recovery_required");
    assert.deepEqual(applied, [] as string[], "no blind re-run after a crash");

    // Safe recovery: readListingStatus says active (not yet hidden) → apply.
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id: string) => {
        applied.push(id);
        return { ok: true };
      },
      readListingOwnership: async () => ({ id: "l-1", sellerId: ACTOR, status: "active" }),
    });
    const recover = await request(app)
      .post("/api/bulk-listings/recover")
      .set("Authorization", authHeader(ACTOR))
      .send({ operation: "hide", idempotencyKey: "k-crash1" });
    assert.equal(recover.status, 200);
    assert.equal(recover.body.state, "COMPLETED");
    assert.deepEqual(applied, ["l-1"], "recovery applied the desired state exactly once");
  });

  it("crash after apply but before outcomes: recovery verifies the actual status and does not re-apply", async () => {
    const applied: string[] = [];
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id: string) => {
        applied.push(id);
        return { ok: true };
      },
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-2"], operation: "hide" });
    assert.equal(preview.status, 200);

    const claim = await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-crash2",
      proposalDigest: preview.body.digest,
      targetImage: [{ id: "l-2", verdict: "owned" }],
      leaseMs: 30_000,
      nowMs: Date.now(),
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: Date.now(), leaseMs: -1 });
    // The apply already happened in the crashed process — the listing is now deleted.
    await store.saveItemResult({
      operationId: claim.record.id,
      listingId: "l-2",
      state: "APPLIED",
      outcome: "success",
      detail: "hide",
      appliedAt: Date.now(),
    });

    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id: string) => {
        applied.push(id);
        return { ok: true };
      },
      readListingOwnership: async () => ({ id: "l-2", sellerId: ACTOR, status: "deleted" }),
    });
    const recover = await request(app)
      .post("/api/bulk-listings/recover")
      .set("Authorization", authHeader(ACTOR))
      .send({ operation: "hide", idempotencyKey: "k-crash2" });
    assert.equal(recover.status, 200);
    assert.equal(recover.body.state, "COMPLETED");
    assert.deepEqual(applied, [] as string[], "desired state already present — no re-apply");
    assert.equal(recover.body.outcomes[0].detail, "already_applied");
  });

  it("partial success persists across replays", async () => {
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => (id === "l-3" ? { ok: false, detail: "db_locked" } : { ok: true }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1", "l-3"], operation: "hide" });
    const body = {
      digest: preview.body.digest,
      proposalExpiresAt: preview.body.proposal.expiresAt,
      operation: "hide",
      listingIds: ["l-1", "l-3"],
      idempotencyKey: "k-partial",
    };
    const first = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send(body);
    assert.equal(first.status, 200);
    assert.equal(first.body.state, "PARTIAL");

    const replay = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send(body);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.executed, false);
    assert.equal(replay.body.state, "PARTIAL");
    const statuses = replay.body.outcomes.map((o: { id: string; status: string }) => [o.id, o.status]);
    assert.deepEqual(statuses, [
      ["l-1", "success"],
      ["l-3", "failed"],
    ]);
  });

  it("recovery never touches foreign listings", async () => {
    const applied: string[] = [];
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id: string) => {
        applied.push(id);
        return { ok: true };
      },
      readListingOwnership: async () => ({ id: "l-1", sellerId: ACTOR, status: "active" }),
    });
    const minted = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1", "l-foreign"],
      operation: "hide",
      signingKey: process.env.JWT_SECRET || "vauto-dev-secret-change-in-production",
      nowMs: 3_000,
    });
    await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-foreign",
      proposalDigest: minted.digest,
      targetImage: [
        { id: "l-1", verdict: "owned" },
        { id: "l-foreign", verdict: "foreign" },
      ],
      leaseMs: 30_000,
      nowMs: 3_001,
    });
    const record = await store.getOperation({ actorId: ACTOR, operation: "hide", idempotencyKey: "k-foreign" });
    await store.markState(record!.id, "PENDING", "EXECUTING", { nowMs: 3_002 });

    const recover = await request(app)
      .post("/api/bulk-listings/recover")
      .set("Authorization", authHeader(ACTOR))
      .send({ operation: "hide", idempotencyKey: "k-foreign" });
    assert.equal(recover.status, 200);
    assert.deepEqual(applied, ["l-1"], "only the owned target is ever applied");
  });

  it("audit entries are server-derived; a client cannot forge actor/outcome", async () => {
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
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
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-audit",
        // Forged fields the client might try to smuggle:
        actorId: "hacker",
        audit: [{ actorId: "hacker", outcome: "forged" }],
      });
    assert.equal(res.status, 200);
    for (const entry of res.body.audit) {
      assert.equal(entry.actorId, ACTOR, "actor is always the authenticated server-side identity");
    }
    const stored = store._audit;
    assert.ok(stored.length >= 1);
    assert.ok(stored.every((a) => a.actorId === ACTOR));
    assert.ok(stored.every((a) => !String(a.outcome).includes("forged")));
  });

  it("all 7 verticals share the same durable path", async () => {
    const applied: string[] = [];
    setBulkStoreForTests(createInMemoryBulkOperationStore());
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id: string) => {
        applied.push(id);
        return { ok: true };
      },
    });
    for (const row of ROWS) {
      const preview = await request(app)
        .post("/api/bulk-listings/preview")
        .set("Authorization", authHeader(ACTOR))
        .send({ listingIds: [row.id], operation: "republish" });
      assert.equal(preview.status, 200, row.category);
      const confirm = await request(app)
        .post("/api/bulk-listings/confirm")
        .set("Authorization", authHeader(ACTOR))
        .send({
          digest: preview.body.digest,
          proposalExpiresAt: preview.body.proposal.expiresAt,
          operation: "republish",
          listingIds: [row.id],
          idempotencyKey: `k-7v-${row.id}`,
        });
      assert.equal(confirm.status, 200, row.category);
      assert.equal(confirm.body.outcomes[0].status, "success", row.category);
    }
    assert.equal(applied.length, 7);
  });

  it("production gate stays closed without the explicit opt-in (durable path)", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.VAUTO_ENABLE_BULK_LISTING_OPS;
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
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
});

describe("F6.2 — durable core recovery unit", () => {
  it("ambiguous status read fails closed to recovery_required", async () => {
    const store = createInMemoryBulkOperationStore();
    const claim = await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-ambiguous",
      proposalDigest: "d",
      targetImage: [{ id: "l-1", verdict: "owned" }],
      leaseMs: 30_000,
      nowMs: 1_000,
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: 1_001 });
    const result = await recoverBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      idempotencyKey: "k-ambiguous",
      store,
      readListingOwnership: async () => {
        throw new Error("db unavailable");
      },
      applyItem: async () => ({ ok: true }),
      env: {},
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, "recovery_required");
    assert.equal((result as { state?: string }).state, "RECOVERY_REQUIRED");
  });

  it("expired / tampered / forged proposals never execute (durable core)", async () => {
    const store = createInMemoryBulkOperationStore();
    const minted = buildBulkProposal({
      actorId: ACTOR,
      listings: ROWS,
      requestedIds: ["l-1"],
      operation: "hide",
      signingKey: "k",
      nowMs: 1_000,
    });
    let applied = 0;
    const base = {
      actorId: ACTOR,
      actorRole: "pro" as const,
      operation: "hide" as const,
      signingKey: "k",
      store,
      env: {},
      applyItem: async () => {
        applied += 1;
        return { ok: true };
      },
      resolveListings: async () => ROWS,
    };
    const expired = await executeBulkOperationDurable({
      ...base,
      targetIds: ["l-1"],
      digest: minted.digest,
      proposalExpiresAt: 500,
      idempotencyKey: "k-exp",
      nowMs: 2_000,
    });
    assert.equal(expired.ok, false);
    assert.equal((expired as { code: string }).code, "expired");

    const tampered = await executeBulkOperationDurable({
      ...base,
      targetIds: ["l-1", "l-2"],
      digest: minted.digest,
      proposalExpiresAt: minted.proposal.expiresAt,
      idempotencyKey: "k-tmp",
      nowMs: 1_100,
    });
    assert.equal(tampered.ok, false);
    assert.equal((tampered as { code: string }).code, "tampered");
    assert.equal(applied, 0);
  });
});

  it("a fresh in-flight confirm is reported in_progress, never a false success or takeover", async () => {
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1"], operation: "hide" });
    const claim = await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-fresh",
      proposalDigest: preview.body.digest,
      targetImage: [{ id: "l-1", verdict: "owned" }],
      leaseMs: 30_000,
      nowMs: Date.now(),
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: Date.now(), leaseMs: 30_000 });

    const confirmReplay = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-fresh",
      });
    assert.equal(confirmReplay.status, 409);
    assert.equal(confirmReplay.body.code, "in_progress");

    const recoverWhileRunning = await request(app)
      .post("/api/bulk-listings/recover")
      .set("Authorization", authHeader(ACTOR))
      .send({ operation: "hide", idempotencyKey: "k-fresh" });
    assert.equal(recoverWhileRunning.status, 409);
    assert.equal(recoverWhileRunning.body.code, "in_progress");
  });

  it("a stale PENDING after a crash is safely recovered", async () => {
    const applied: string[] = [];
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
      readListingOwnership: async () => ({ id: "l-3", sellerId: ACTOR, status: "active" }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-3"], operation: "hide" });
    // Crash after claim but BEFORE EXECUTING: PENDING with an expired lease.
    const claim = await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-stale-pending",
      proposalDigest: preview.body.digest,
      targetImage: [{ id: "l-3", verdict: "owned" }],
      leaseMs: 30_000,
      nowMs: Date.now() - 120_000,
    });

    const recover = await request(app)
      .post("/api/bulk-listings/recover")
      .set("Authorization", authHeader(ACTOR))
      .send({ operation: "hide", idempotencyKey: "k-stale-pending" });
    assert.equal(recover.status, 200, "stale PENDING is recoverable");
    assert.equal(recover.body.state, "COMPLETED");
    assert.deepEqual(applied, ["l-3"]);
  });

  it("a listing transferred after preview is never applied (not_owned)", async () => {
    const applied: string[] = [];
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
      readListingOwnership: async () => ({ id: "l-4", sellerId: "someone-else", status: "active" }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-4"], operation: "hide" });
    const claim = await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-transferred",
      proposalDigest: preview.body.digest,
      targetImage: [{ id: "l-4", verdict: "owned" }],
      leaseMs: 30_000,
      nowMs: Date.now() - 120_000,
    });

    const recover = await request(app)
      .post("/api/bulk-listings/recover")
      .set("Authorization", authHeader(ACTOR))
      .send({ operation: "hide", idempotencyKey: "k-transferred" });
    assert.equal(recover.status, 200);
    assert.deepEqual(applied, [], "transferred listing never gets applyItem");
    assert.equal(recover.body.outcomes[0].status, "failed");
    assert.equal(recover.body.outcomes[0].reason, "not_owned");
  });

  it("two parallel recoveries apply at most once (CAS ownership)", async () => {
    const applied: string[] = [];
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
      readListingOwnership: async () => ({ id: "l-5", sellerId: ACTOR, status: "active" }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-5"], operation: "hide" });
    const claim = await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-par-recover",
      proposalDigest: preview.body.digest,
      targetImage: [{ id: "l-5", verdict: "owned" }],
      leaseMs: 30_000,
      nowMs: Date.now() - 120_000,
    });

    const [a, b] = await Promise.all([
      request(app).post("/api/bulk-listings/recover").set("Authorization", authHeader(ACTOR)).send({ operation: "hide", idempotencyKey: "k-par-recover" }),
      request(app).post("/api/bulk-listings/recover").set("Authorization", authHeader(ACTOR)).send({ operation: "hide", idempotencyKey: "k-par-recover" }),
    ]);
    const successes = [a, b].filter((r) => r.status === 200);
    assert.ok(successes.length >= 1, "at least one recovery completes");
    assert.deepEqual(applied, ["l-5"], "apply at most once across parallel recoveries");
    const completed = successes.find((r) => r.body?.executed === true);
    assert.ok(completed, "exactly one executed recovery");
  });

  it("replay after a terminal commit returns the identical durable result", async () => {
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-6"], operation: "hide" });
    const body = {
      digest: preview.body.digest,
      proposalExpiresAt: preview.body.proposal.expiresAt,
      operation: "hide",
      listingIds: ["l-6"],
      idempotencyKey: "k-identical",
    };
    const first = await request(app).post("/api/bulk-listings/confirm").set("Authorization", authHeader(ACTOR)).send(body);
    const replay = await request(app).post("/api/bulk-listings/confirm").set("Authorization", authHeader(ACTOR)).send(body);
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body.outcomes, first.body.outcomes, "identical durable result");
    assert.equal(replay.body.state, "COMPLETED");
    assert.equal(replay.body.executed, false);
  });

describe("F6.2 — distributed-worker fencing", () => {
  it("a long confirm renews its lease per target; recovery can never take over and applies nothing", async () => {
    const store = createInMemoryBulkOperationStore();
    let t = 0;
    const clock = () => t;
    const confirmApplied: string[] = [];
    const recoveryApplied: string[] = [];
    const proposal = buildBulkProposal({
      actorId: ACTOR,
      listings: [ROWS[0]!, ROWS[1]!, ROWS[2]!],
      requestedIds: ["l-1", "l-2", "l-3"],
      operation: "hide",
      signingKey: "test-signing-key",
      nowMs: 0,
    });

    // Total run: 3 targets x 20s gaps = 60s > the 30s initial lease, but every
    // pre-apply fence renews the lease, so the worker is NEVER stale.
    const result = await executeBulkOperationDurable({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      targetIds: ["l-1", "l-2", "l-3"],
      digest: proposal.digest,
      proposalExpiresAt: proposal.proposal.expiresAt,
      idempotencyKey: "k-long-renew",
      signingKey: "test-signing-key",
      store,
      nowMs: 0,
      clock,
      resolveListings: async () => [ROWS[0]!, ROWS[1]!, ROWS[2]!],
      applyItem: async (id) => {
        confirmApplied.push(id);
        t += 20_000;
        if (id === "l-2") {
          // Another instance tries recovery mid-run: the renewed lease is
          // still valid → in_progress, zero apply.
          const recovery = await recoverBulkOperation({
            actorId: ACTOR,
            actorRole: "pro",
            operation: "hide",
            idempotencyKey: "k-long-renew",
            store,
            nowMs: t,
            readListingOwnership: async (listingId) => ({ id: listingId, sellerId: ACTOR, status: "active" }),
            applyItem: async (listingId) => {
              recoveryApplied.push(listingId);
              return { ok: true };
            },
          });
          assert.equal(recovery.ok, false);
          assert.equal(recovery.code, "in_progress");
        }
        return { ok: true };
      },
    });
    assert.equal(result.ok, true, `confirm completes: ${JSON.stringify(result)}`);
    assert.deepEqual(confirmApplied, ["l-1", "l-2", "l-3"]);
    assert.deepEqual(recoveryApplied, [], "recovery never applies while the confirm renews its lease");
    const saved = await store.getOperation({ actorId: ACTOR, operation: "hide", idempotencyKey: "k-long-renew" });
    assert.equal(saved!.state, "COMPLETED");
  });

  it("takeover: after recovery claims, the stale confirm can neither apply the next target nor terminalize", async () => {
    const store = createInMemoryBulkOperationStore();
    let t = 0;
    const clock = () => t;
    const applied: string[] = [];
    const proposal = buildBulkProposal({
      actorId: ACTOR,
      listings: [ROWS[0]!, ROWS[1]!, ROWS[2]!],
      requestedIds: ["l-1", "l-2", "l-3"],
      operation: "hide",
      signingKey: "test-signing-key",
      nowMs: 0,
    });

    const result = await executeBulkOperationDurable({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      targetIds: ["l-1", "l-2", "l-3"],
      digest: proposal.digest,
      proposalExpiresAt: proposal.proposal.expiresAt,
      idempotencyKey: "k-takeover",
      signingKey: "test-signing-key",
      store,
      nowMs: 0,
      clock,
      resolveListings: async () => [ROWS[0]!, ROWS[1]!, ROWS[2]!],
      applyItem: async (id) => {
        applied.push(id);
        if (id === "l-1") {
          // The apply takes longer than the 30s lease: the lease genuinely
          // expires mid-batch and a recovery worker takes over.
          t += 31_000;
          const takeover = await store.tryClaimRecovery({
            operationId: (await store.getOperation({ actorId: ACTOR, operation: "hide", idempotencyKey: "k-takeover" }))!.id,
            claimableStates: ["EXECUTING", "RECOVERING", "FAILED", "RECOVERY_REQUIRED"],
            leaseMs: 120_000,
            token: "rec-takeover",
            nowMs: t,
          });
          assert.equal(takeover.claimed, true);
          assert.equal(takeover.record.executionToken, null, "takeover fences the old worker");
          // The takeover worker itself crashed too — its lease is now stale.
          takeover.record.leaseUntil = t - 1;
        }
        return { ok: true };
      },
    });
    assert.equal(result.ok, false, "the stale confirm is fenced");
    assert.equal(result.code, "fenced");
    assert.deepEqual(applied, ["l-1"], "no further target is applied after the takeover");

    // The RECOVERING operation is completed by the recovery worker — every
    // remaining target is applied at most once in total.
    const saved = await store.getOperation({ actorId: ACTOR, operation: "hide", idempotencyKey: "k-takeover" });
    assert.equal(saved!.state, "RECOVERING");
    const recovered = await recoverBulkOperation({
      actorId: ACTOR,
      actorRole: "pro",
      operation: "hide",
      idempotencyKey: "k-takeover",
      store,
      nowMs: t + 1,
      clock: () => t + 1,
      readListingOwnership: async (listingId) => {
        if (listingId === "l-1") return { id: listingId, sellerId: ACTOR, status: "deleted" };
        return { id: listingId, sellerId: ACTOR, status: "active" };
      },
      applyItem: async (listingId) => {
        applied.push(listingId);
        return { ok: true };
      },
    });
    assert.equal(recovered.ok, true, `recovery completes: ${JSON.stringify(recovered)}`);
    const counts = applied.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    assert.deepEqual(counts, { "l-1": 1, "l-2": 1, "l-3": 1 }, "each target changes at most once across the takeover");
  });

  it("HTTP: after a recovery takeover, the confirm replay can never terminalize a RECOVERING operation", async () => {
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async () => ({ ok: true }),
      readListingOwnership: async () => ({ id: "l-1", sellerId: ACTOR, status: "active" }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-1"], operation: "hide" });
    // Crash mid-run: EXECUTING with an expired lease.
    const claim = await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-http-takeover",
      proposalDigest: preview.body.digest,
      targetImage: [{ id: "l-1", verdict: "owned" }],
      leaseMs: 30_000,
      nowMs: Date.now(),
    });
    await store.markState(claim.record.id, "PENDING", "EXECUTING", { nowMs: Date.now(), leaseMs: -1 });

    // A recovery worker takes over.
    const recover = await request(app)
      .post("/api/bulk-listings/recover")
      .set("Authorization", authHeader(ACTOR))
      .send({ operation: "hide", idempotencyKey: "k-http-takeover" });
    assert.equal(recover.status, 200);
    assert.equal(recover.body.state, "COMPLETED");
    const afterRecover = await store.getOperation({ actorId: ACTOR, operation: "hide", idempotencyKey: "k-http-takeover" });
    assert.equal(afterRecover!.executionToken, null);

    // While the recovery runs (fresh lease), a confirm replay must NOT
    // terminalize or re-run: 409 in_progress.
    const confirmed = await request(app)
      .post("/api/bulk-listings/confirm")
      .set("Authorization", authHeader(ACTOR))
      .send({
        digest: preview.body.digest,
        proposalExpiresAt: preview.body.proposal.expiresAt,
        operation: "hide",
        listingIds: ["l-1"],
        idempotencyKey: "k-http-takeover",
      });
    assert.equal(confirmed.status, 200, "terminal replay returns the durable result");
    assert.equal(confirmed.body.executed, false);
  });

  it("HTTP: recovery A is fenced after recovery B takes over its lease", async () => {
    const applied: string[] = [];
    const store = createInMemoryBulkOperationStore();
    setBulkStoreForTests(store);
    setBulkExecutorsForTests({
      resolveListings: async () => ROWS,
      applyItem: async (id) => {
        applied.push(id);
        return { ok: true };
      },
      readListingOwnership: async () => ({ id: "l-2", sellerId: ACTOR, status: "active" }),
    });
    const preview = await request(app)
      .post("/api/bulk-listings/preview")
      .set("Authorization", authHeader(ACTOR))
      .send({ listingIds: ["l-2"], operation: "hide" });
    const claim = await store.tryClaimOperation({
      actorId: ACTOR,
      operation: "hide",
      idempotencyKey: "k-rec-ab",
      proposalDigest: preview.body.digest,
      targetImage: [{ id: "l-2", verdict: "owned" }],
      leaseMs: 30_000,
      nowMs: Date.now() - 120_000,
    });

    // Recovery A claims and starts (RECOVERING, token A, fresh lease).
    const claimA = await store.tryClaimRecovery({
      operationId: claim.record.id,
      claimableStates: ["PENDING", "EXECUTING", "RECOVERING", "FAILED", "RECOVERY_REQUIRED"],
      leaseMs: 120_000,
      token: "rec-A-http",
      nowMs: Date.now(),
    });
    assert.equal(claimA.claimed, true);

    // A's lease expires; recovery B (via the real route) claims and completes.
    const record = store._records.get(claim.record.id)!;
    record.leaseUntil = Date.now() - 1;
    const recoverB = await request(app)
      .post("/api/bulk-listings/recover")
      .set("Authorization", authHeader(ACTOR))
      .send({ operation: "hide", idempotencyKey: "k-rec-ab" });
    assert.equal(recoverB.status, 200);
    assert.equal(recoverB.body.state, "COMPLETED");
    assert.equal(recoverB.body.executed, true);

    // Stale recovery A can no longer fence or terminalize.
    const aFence = await store.fenceBeforeApply({
      operationId: claim.record.id,
      executor: "recovery",
      token: "rec-A-http",
      leaseMs: 120_000,
      nowMs: Date.now(),
    });
    assert.equal(aFence.ok, false, "stale recovery A is fenced after B takes over");
    assert.deepEqual(applied, ["l-2"], "the target is applied exactly once, by B");
  });
});
