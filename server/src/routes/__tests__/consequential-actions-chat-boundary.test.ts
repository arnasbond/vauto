/**
 * VAUTO AI Maturity — Phase 2A: Chat-Level Human Control Verification.
 *
 * LABEL (corrected per Phase 2A audit remediation): this is a SERVER
 * tool→HTTP integration test. It never touches the browser/client — no
 * `VautoAgentContext`, no `showConfirm()`, no `apiConfirmConsequentialAction`
 * client wrapper, no `apiVautoAgentStream()`. It manually bridges
 * `executeAgentTool()`'s proposal output straight into the Express router's
 * `/confirm` and `/cancel` handlers in the same process. That is a
 * legitimate and useful SERVER-SIDE proof that the tool-proposal shape the
 * real agent loop produces is exactly what the real HTTP layer accepts —
 * but it is NOT client/UI coverage and must not be described as such.
 *
 * The actual client-side dialog wiring (the part this file skips) is
 * covered separately and honestly by:
 *  - `src/lib/__tests__/consequential-action-dialog-handler.test.ts`
 *    (client/context integration test — real sideEffect handlers, real
 *    `createConfirmDialogController`, real client wrapper, network mocked);
 *  - `src/lib/__tests__/vauto-agent-stream-continuation.test.ts`
 *    (client/context integration test — real `apiVautoAgentStream()`
 *    continuation from an unhandled quick reply through to those same real
 *    sideEffect handlers).
 * No true browser E2E test of this boundary exists in this repository.
 *
 * Existing suites each exercise ONE layer in isolation:
 *  - `ai/confirmation/__tests__/consequential-action-policy.test.ts` drives
 *    the pure policy functions directly with hand-built fixtures.
 *  - `ai/__tests__/consequential-action-tools.test.ts` drives the tool
 *    surface (`executeAgentTool`) but never confirms anything afterwards.
 *  - `routes/__tests__/consequential-actions-http.test.ts` drives the real
 *    Express router, but always seeds pending actions via
 *    `proposeConsequentialAction()` directly rather than the actual chat
 *    tool call.
 *
 * This file is the missing SERVER-SIDE link: it proposes through the REAL
 * tool-call surface an actual chat turn would invoke (`executeAgentTool`),
 * then confirms/cancels/replays through the REAL Express router
 * (`consequentialActionsRouter`) — proving the tool-proposal → HTTP-confirm
 * shape is wired correctly end-to-end on the server, for the Phase 2A
 * required scenarios, not just each half of it separately.
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
  setDefaultPendingActionStoreForTests,
} from "../../ai/confirmation/consequential-action-policy.js";
import { executeAgentTool, type AgentToolContext } from "../../ai/agent-tools.js";
import type { MyListingForAgent } from "../../ai/user-agent-context.js";

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

function baseCtx(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    userCity: "Vilnius",
    userRole: "seller",
    contact: "",
    listingsSnapshot: [
      { id: "snapshot-listing", title: "Snapshot", price: 1, category: "other", location: "Vilnius" },
    ],
    ...overrides,
  };
}

const app = createApp();

describe("Phase 2A — chat/client boundary: real tool proposal + real HTTP confirm/cancel", () => {
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

  it("REQUIRED SCENARIO 4 — a genuine tool-proposed markListingSold, confirmed through the real route, executes exactly once and replays return the cached outcome", async () => {
    const myListings: MyListingForAgent[] = [
      { id: "listing-1", title: "BMW 320d", price: 8000, category: "vehicles", location: "Vilnius", status: "active" },
    ];
    const ctx = baseCtx({ authUserId: "user-1", myListings });

    // Step 1: the actual chat tool call an LLM turn would invoke.
    const { result, sideEffect } = await executeAgentTool("markListingSold", {}, ctx);
    assert.equal((result as { ok: boolean }).ok, true);
    assert.ok(sideEffect && sideEffect.type === "mark_listing_sold");
    const pendingActionId =
      sideEffect!.type === "mark_listing_sold" ? sideEffect.pendingActionId : "";
    assert.ok(pendingActionId);

    // Step 2: the exact HTTP call the client's showConfirm() dialog makes.
    const body = { pendingActionId, type: "markListingSold", targetId: "listing-1" };
    const first = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send(body);
    assert.equal(first.status, 200);
    assert.equal(first.body.replay, false);
    assert.equal(markSoldCalls.length, 1);

    // Step 3: a replay (double network retry / re-render) must never mutate again.
    const replay = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send(body);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replay, true);
    assert.deepEqual(replay.body.result, first.body.result);
    assert.equal(markSoldCalls.length, 1, "replay must never re-invoke the domain executor");
  });

  it("REQUIRED SCENARIO 4 — a genuine tool-proposed blockListing, confirmed through the real route, executes exactly once", async () => {
    const ctx = baseCtx({ authUserId: "admin-1", userRole: "admin" });
    const { sideEffect } = await executeAgentTool(
      "blockListing",
      { listingId: "listing-9", reason: "suspicious" },
      ctx
    );
    assert.ok(sideEffect && sideEffect.type === "block_listing");
    const pendingActionId = sideEffect!.type === "block_listing" ? sideEffect.pendingActionId : "";

    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("admin-1", "admin"))
      .send({ pendingActionId, type: "blockListing", targetId: "listing-9" });
    assert.equal(res.status, 200);
    assert.equal(res.body.replay, false);
    assert.equal(blockCalls.length, 1);
  });

  it("REQUIRED SCENARIO 2 — a tool-proposed action cancelled through the real route can never later be revived by confirming the SAME id", async () => {
    const myListings: MyListingForAgent[] = [
      { id: "listing-1", title: "BMW 320d", price: 8000, category: "vehicles", location: "Vilnius", status: "active" },
    ];
    const ctx = baseCtx({ authUserId: "user-1", myListings });
    const { sideEffect } = await executeAgentTool("markListingSold", {}, ctx);
    const pendingActionId =
      sideEffect!.type === "mark_listing_sold" ? sideEffect.pendingActionId : "";

    // The client calls /cancel when the user dismisses the dialog (or, after
    // the Phase 2A confirm-dialog-queue fix, when a later intent pivot
    // supersedes it).
    const cancelRes = await request(app)
      .post("/api/consequential-actions/cancel")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId });
    assert.equal(cancelRes.status, 200);

    // A later "taip" (of any kind) can only ever resurface as ANOTHER
    // /confirm call carrying this SAME already-cancelled id — prove it is
    // permanently dead, not merely dead until some retry.
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post("/api/consequential-actions/confirm")
        .set("Authorization", authHeader("user-1"))
        .send({ pendingActionId, type: "markListingSold", targetId: "listing-1" });
      assert.equal(res.status, 409);
      assert.equal(res.body.replay, false);
    }
    assert.equal(markSoldCalls.length, 0, "a cancelled tool-proposed action must never execute, ever");
  });

  it("REQUIRED SCENARIO 3 — a tool-proposed action cannot be confirmed by any user other than the one it was proposed for", async () => {
    const myListings: MyListingForAgent[] = [
      { id: "listing-1", title: "BMW 320d", price: 8000, category: "vehicles", location: "Vilnius", status: "active" },
    ];
    const ctx = baseCtx({ authUserId: "user-1", myListings });
    const { sideEffect } = await executeAgentTool("markListingSold", {}, ctx);
    const pendingActionId =
      sideEffect!.type === "mark_listing_sold" ? sideEffect.pendingActionId : "";

    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("attacker-2"))
      .send({ pendingActionId, type: "markListingSold", targetId: "listing-1" });
    assert.equal(res.status, 403);
    assert.equal(markSoldCalls.length, 0);
  });

  it('REQUIRED SCENARIO 1 — a bare "taip"/invented/foreign identifier sent to the real confirmation route is rejected outright and never executes', async () => {
    // There is no textual parsing path from chat into this endpoint — the
    // ONLY valid input is the exact opaque id minted server-side by the
    // tool proposal. Prove the real route (not just the pure policy
    // function) rejects every shape a bare affirmative reply, or a
    // fabricated/guessed id, could plausibly take.
    const invented = [
      "taip",
      "yes",
      "gerai",
      "undefined",
      "null",
      "00000000-0000-0000-0000-000000000000",
      "user-1:markListingSold:listing-1",
    ];
    for (const pendingActionId of invented) {
      const res = await request(app)
        .post("/api/consequential-actions/confirm")
        .set("Authorization", authHeader("user-1"))
        .send({ pendingActionId, type: "markListingSold", targetId: "listing-1" });
      assert.equal(res.status, 404, `"${pendingActionId}" must be rejected as not_found`);
    }
    assert.equal(markSoldCalls.length, 0);
    assert.equal(blockCalls.length, 0);
  });

  it("REQUIRED SCENARIO 6 — the tool-visible result never contains a value usable as the confirmation id, cross-checked against the real store", async () => {
    const myListings: MyListingForAgent[] = [
      { id: "listing-1", title: "BMW 320d", price: 8000, category: "vehicles", location: "Vilnius", status: "active" },
    ];
    const ctx = baseCtx({ authUserId: "user-1", myListings });
    const { result, sideEffect } = await executeAgentTool("markListingSold", {}, ctx);
    const realId = sideEffect!.type === "mark_listing_sold" ? sideEffect.pendingActionId : "";

    // The LLM only ever sees `result` (echoed into functionResponse) — never
    // `sideEffect`. Confirm nothing in it, when sent to the real route,
    // resolves to the real pending action.
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

    const res = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId: serialized, type: "markListingSold", targetId: "listing-1" });
    assert.equal(res.status, 404);
    assert.equal(markSoldCalls.length, 0);

    // Sanity: the REAL id (never sent to the model) does work, proving the
    // above 404 is a genuine rejection and not an unrelated route failure.
    const genuine = await request(app)
      .post("/api/consequential-actions/confirm")
      .set("Authorization", authHeader("user-1"))
      .send({ pendingActionId: realId, type: "markListingSold", targetId: "listing-1" });
    assert.equal(genuine.status, 200);
    assert.equal(markSoldCalls.length, 1);
  });
});
