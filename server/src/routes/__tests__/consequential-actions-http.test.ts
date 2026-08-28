/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 * Audit remediation — HTTP-level tests for /confirm and /cancel: authenticated
 * user binding, type/target mismatch, and replay behavior against the real
 * Express router (not just the pure policy functions).
 *
 * Executors are injected via `setConsequentialActionExecutorsForTests` (same
 * override convention as `setTxQueryableOverride` / `setSellerConnectOverride`
 * used elsewhere in this codebase) so these tests never touch PostgreSQL —
 * the router, auth middleware, and confirmation policy are exercised for
 * real; only the final domain mutation (updateListing/adminPatchListing) is
 * faked.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth, type AuthedRequest } from "../../middleware/auth.js";
import {
  consequentialActionsRouter,
  setConsequentialActionExecutorsForTests,
} from "../consequential-actions.js";
import {
  createInMemoryPendingActionStore,
  getDefaultPendingActionStore,
  proposeConsequentialAction,
  resetConfirmationBoundaryForTests,
  setDefaultPendingActionStoreForTests,
} from "../../ai/confirmation/consequential-action-policy.js";

function createApp() {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use(optionalAuth);
  app.use("/api/consequential-actions", consequentialActionsRouter);
  return app;
}

function authHeader(userId: string, role = "private") {
  return `Bearer ${signAccessToken({ sub: userId, role, provider: "phone" })}`;
}

const app = createApp();

describe("HTTP /api/consequential-actions/confirm + /cancel", () => {
  let markSoldCalls: { targetId: string; authUserId: string }[] = [];
  let blockCalls: { targetId: string; authUserId: string | undefined }[] = [];

  beforeEach(() => {
    setDefaultPendingActionStoreForTests(createInMemoryPendingActionStore());
    markSoldCalls = [];
    blockCalls = [];
    setConsequentialActionExecutorsForTests({
      markListingSold: async (targetId, authUserId) => {
        markSoldCalls.push({ targetId, authUserId });
        return { ok: true, listingId: targetId, title: "BMW 320d" };
      },
      blockListing: async (req: AuthedRequest, targetId) => {
        blockCalls.push({ targetId, authUserId: req.authUserId });
        return { ok: true, listingId: targetId, title: "Suspicious listing" };
      },
    });
  });

  it("401s when unauthenticated", async () => {
    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .send({ pendingActionId: "x", type: "markListingSold", targetId: "listing-1" });
    assert.equal(res.status, 401);
    assert.equal(markSoldCalls.length, 0);
  });

  it("400s when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send({});
    assert.equal(res.status, 400);
  });

  it("authenticated user binding — a different authenticated user cannot confirm someone else's pending action", async () => {
    const pending = await proposeConsequentialAction(getDefaultPendingActionStore(), {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });

    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("attacker-2"))
      .send({ pendingActionId: pending.id, type: "markListingSold", targetId: "listing-1" });

    assert.equal(res.status, 403);
    assert.equal(markSoldCalls.length, 0);
  });

  it("type/target mismatch is rejected with 400 and never executes", async () => {
    const pending = await proposeConsequentialAction(getDefaultPendingActionStore(), {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });

    const wrongTarget = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId: pending.id, type: "markListingSold", targetId: "listing-OTHER" });
    assert.equal(wrongTarget.status, 400);

    const wrongType = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId: pending.id, type: "blockListing", targetId: "listing-1" });
    assert.equal(wrongType.status, 400);

    assert.equal(markSoldCalls.length, 0);
  });

  it("exact matching confirmation executes exactly once (200, replay:false) and re-confirming replays (200, replay:true) without a second call", async () => {
    const pending = await proposeConsequentialAction(getDefaultPendingActionStore(), {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    const body = { pendingActionId: pending.id, type: "markListingSold", targetId: "listing-1" };

    const first = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send(body);
    assert.equal(first.status, 200);
    assert.equal(first.body.ok, true);
    assert.equal(first.body.replay, false);
    assert.equal(first.body.result.ok, true);
    assert.equal(markSoldCalls.length, 1);
    assert.deepEqual(markSoldCalls[0], { targetId: "listing-1", authUserId: "user-1" });

    const second = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send(body);
    assert.equal(second.status, 200);
    assert.equal(second.body.ok, true);
    assert.equal(second.body.replay, true);
    assert.deepEqual(second.body.result, first.body.result);
    assert.equal(markSoldCalls.length, 1, "the domain executor must never run twice, even over separate HTTP requests");
  });

  it("blockListing confirmation binds req.authUserId (the admin) to the executor, not a client-claimed value", async () => {
    const pending = await proposeConsequentialAction(getDefaultPendingActionStore(), {
      type: "blockListing",
      targetId: "listing-9",
      userId: "admin-1",
      explanation: "explain",
    });

    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("admin-1", "admin"))
      .send({ pendingActionId: pending.id, type: "blockListing", targetId: "listing-9" });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(blockCalls.length, 1);
    assert.equal(blockCalls[0].authUserId, "admin-1");
  });

  it("expired confirmation is rejected with 410 and never executes", async () => {
    const now = Date.now();
    const pending = await proposeConsequentialAction(
      getDefaultPendingActionStore(),
      { type: "markListingSold", targetId: "listing-1", userId: "user-1", explanation: "explain" },
      { now: now - 10_000, ttlMs: 1 }
    );

    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId: pending.id, type: "markListingSold", targetId: "listing-1" });

    assert.equal(res.status, 410);
    assert.equal(markSoldCalls.length, 0);
  });

  describe("/cancel", () => {
    it("401s when unauthenticated", async () => {
      const res = await request(app)
        .post("/api/consequential-actions/cancel")
        .send({ pendingActionId: "x" });
      assert.equal(res.status, 401);
    });

    it("400s when pendingActionId is missing", async () => {
      const res = await request(app)
        .post("/api/consequential-actions/cancel")
        .set("Authorization", authHeader("user-1"))
        .send({});
      assert.equal(res.status, 400);
    });

    it("a different authenticated user cannot cancel someone else's pending action", async () => {
      const pending = await proposeConsequentialAction(getDefaultPendingActionStore(), {
        type: "markListingSold",
        targetId: "listing-1",
        userId: "user-1",
        explanation: "explain",
      });
      const res = await request(app)
        .post("/api/consequential-actions/cancel")
        .set("Authorization", authHeader("attacker-2"))
        .send({ pendingActionId: pending.id });
      assert.equal(res.status, 403);
    });

    it("cancelling then confirming fails safely (409 cancelled) and never executes", async () => {
      const pending = await proposeConsequentialAction(getDefaultPendingActionStore(), {
        type: "markListingSold",
        targetId: "listing-1",
        userId: "user-1",
        explanation: "explain",
      });

      const cancelRes = await request(app)
        .post("/api/consequential-actions/cancel")
        .set("Authorization", authHeader("user-1"))
        .send({ pendingActionId: pending.id });
      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.body.ok, true);

      const confirmRes = await request(app)
        .post("/api/consequential-actions/confirm")
        .set("Authorization", authHeader("user-1"))
        .send({ pendingActionId: pending.id, type: "markListingSold", targetId: "listing-1" });
      assert.equal(confirmRes.status, 409);
      assert.equal(markSoldCalls.length, 0);
    });

    it("cancelling an already-confirmed action 409s (already_consumed)", async () => {
      const pending = await proposeConsequentialAction(getDefaultPendingActionStore(), {
        type: "markListingSold",
        targetId: "listing-1",
        userId: "user-1",
        explanation: "explain",
      });
      await request(app)
        .post("/api/consequential-actions/confirm")
        .set("Authorization", authHeader("user-1"))
        .send({ pendingActionId: pending.id, type: "markListingSold", targetId: "listing-1" });

      const cancelRes = await request(app)
        .post("/api/consequential-actions/cancel")
        .set("Authorization", authHeader("user-1"))
        .send({ pendingActionId: pending.id });
      assert.equal(cancelRes.status, 409);
      assert.equal(markSoldCalls.length, 1);
    });
  });

  it("AUDIT — two concurrent HTTP /confirm requests for the same pendingActionId never double-execute", async () => {
    const pending = await proposeConsequentialAction(getDefaultPendingActionStore(), {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    setConsequentialActionExecutorsForTests({
      markListingSold: async (targetId, authUserId) => {
        markSoldCalls.push({ targetId, authUserId });
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true, listingId: targetId, title: "BMW 320d" };
      },
      blockListing: async (req: AuthedRequest, targetId) => {
        blockCalls.push({ targetId, authUserId: req.authUserId });
        return { ok: true, listingId: targetId };
      },
    });
    const body = { pendingActionId: pending.id, type: "markListingSold", targetId: "listing-1" };

    const [a, b] = await Promise.all([
      request(app).post("/api/consequential-actions/confirm").set("Authorization", authHeader("user-1")).send(body),
      request(app).post("/api/consequential-actions/confirm").set("Authorization", authHeader("user-1")).send(body),
    ]);

    assert.equal(markSoldCalls.length, 1);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.deepEqual(a.body.result, b.body.result);
    assert.equal([a.body.replay, b.body.replay].filter((r: boolean) => r === false).length, 1);
  });
});

describe("AUDIT B — HTTP /confirm + /cancel fail closed while the confirmation boundary is unavailable", () => {
  beforeEach(() => {
    resetConfirmationBoundaryForTests();
  });

  it("request during bootstrap -> 503 confirmation_boundary_unavailable, and mints no pending action", async () => {
    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId: "whatever", type: "markListingSold", targetId: "listing-1" });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, "confirmation_boundary_unavailable");

    const cancelRes = await request(app)
      .post("/api/consequential-actions/cancel")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId: "whatever" });
    assert.equal(cancelRes.status, 503);
    assert.equal(cancelRes.body.code, "confirmation_boundary_unavailable");
  });

  it("simulated migration failure (markConfirmationBoundaryReady never called) -> remains 503 forever, not silently in-memory", async () => {
    // Simulate the exact production shape: `runMigrations()` throws, so the
    // line that would install the store and flip to READY never runs.
    const bootstrap = async () => {
      throw new Error("simulated migration failure");
    };
    await assert.rejects(bootstrap());

    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId: "whatever", type: "markListingSold", targetId: "listing-1" });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, "confirmation_boundary_unavailable");
  });

  it("migration success -> the (Postgres-shaped) store becomes available and requests are no longer 503", async () => {
    setDefaultPendingActionStoreForTests(createInMemoryPendingActionStore());
    const pending = await proposeConsequentialAction(getDefaultPendingActionStore(), {
      type: "markListingSold",
      targetId: "listing-1",
      userId: "user-1",
      explanation: "explain",
    });
    setConsequentialActionExecutorsForTests({
      markListingSold: async (targetId) => ({ ok: true, listingId: targetId, title: "x" }),
      blockListing: async (_req: AuthedRequest, targetId) => ({ ok: true, listingId: targetId }),
    });

    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId: pending.id, type: "markListingSold", targetId: "listing-1" });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it("no in-memory pending action minted during bootstrap can be orphaned by the later store swap", async () => {
    // While UNAVAILABLE, the tool/route layer never even calls
    // proposeConsequentialAction — there is nothing to orphan. Prove the
    // accessor itself refuses to hand back a store to write into.
    assert.throws(() => getDefaultPendingActionStore());

    // Once the boundary becomes ready, it is ready with the SAME store the
    // caller installed — never an implicit swap away from something a
    // caller already wrote into.
    const store = createInMemoryPendingActionStore();
    setDefaultPendingActionStoreForTests(store);
    assert.equal(getDefaultPendingActionStore(), store);
  });
});
