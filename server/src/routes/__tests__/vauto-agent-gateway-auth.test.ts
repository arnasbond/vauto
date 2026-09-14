/**
 * Package P0.1 — Gateway auth convergence and guest thread isolation tests.
 *
 * Tests router-level optionalAuth mount on /api/vauto-agent:
 * 1. Unauthenticated guest text turn succeeds (starts thread, mints anonSessionToken).
 * 2. Unauthenticated guest continuation requires anonSessionToken (missing/wrong -> 403).
 * 3. Guest A vs Guest B thread isolation.
 * 4. Vision capability gate: pending images from unauthenticated user -> 401 auth_required.
 * 5. Vision capability gate: authenticated user with pending images -> allowed.
 * 6. Thread claim lifecycle: anon -> user claim -> already_bound rejection -> user ownership isolation.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import { vautoAgentRouter } from "../vauto-agent.js";
import { consequentialActionsRouter } from "../consequential-actions.js";
import { InMemoryThreadStore } from "../../agent-core/thread-store.js";
import { setThreadStoreForTests } from "../../agent-core/thread-store-instance.js";
import { setThreadAgentForTests } from "../../agent-core/thread-service.js";
import { setAgentUserContextResolverForTests } from "../../ai/user-agent-context.js";

function buildTestApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  // Canonical gateway mount: optionalAuth
  app.use("/api/vauto-agent", optionalAuth, vautoAgentRouter);
  app.use("/api/consequential-actions", requireAuth, consequentialActionsRouter);
  return app;
}

describe("P0.1 — Gateway auth convergence and capability gating", () => {
  let app: express.Express;

  beforeEach(() => {
    setThreadStoreForTests(new InMemoryThreadStore());
    setThreadAgentForTests(async () => {
      return {
        ok: true,
        reply: "Štai paieškos rezultatai.",
        actions: { type: "none" },
        toolCalls: [],
        context: {},
      };
    });
    setAgentUserContextResolverForTests(async (authUserId) => {
      return {
        userName: authUserId ?? "Svečias",
        accountType: authUserId ? "Privatus" : "Svečias",
        userCity: "Vilnius",
        contact: "+37060000000",
        userRole: "buyer",
        isAuthenticated: Boolean(authUserId),
        myListings: [],
        myListingsSummary: "",
      };
    });
    process.env.GEMINI_API_KEY = "p0-gateway-test-key";
    app = buildTestApp();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    setAgentUserContextResolverForTests(null);
    setThreadAgentForTests(null);
    setThreadStoreForTests(null);
  });

  it("1. Guest text request is NOT blocked by gateway 401 and returns a new thread with anonSessionToken", async () => {
    const res = await request(app)
      .post("/api/vauto-agent")
      .send({
        messages: [{ role: "user", text: "Ieškau automobilio iki 5000 eurų" }],
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.thread?.threadId, "Expected thread.threadId in response");
    assert.ok(res.body.thread?.anonSessionToken, "Expected thread.anonSessionToken for guest");
    assert.equal(typeof res.body.thread.anonSessionToken, "string");
  });

  it("2. Guest continuation with correct anonSessionToken succeeds and increments version", async () => {
    const first = await request(app)
      .post("/api/vauto-agent")
      .send({
        messages: [{ role: "user", text: "Ieškau BMW" }],
      });

    assert.equal(first.status, 200);
    const threadId = first.body.thread.threadId;
    const anonToken = first.body.thread.anonSessionToken;
    const v1 = first.body.thread.version;

    const second = await request(app)
      .post("/api/vauto-agent")
      .send({
        threadId,
        anonSessionToken: anonToken,
        messages: [{ role: "user", text: "Tik dyzelinas" }],
      });

    assert.equal(second.status, 200);
    assert.equal(second.body.thread.threadId, threadId);
    assert.ok(second.body.thread.version > v1, "Version must increment");
  });

  it("3. Guest continuation without anonSessionToken fails closed (403 thread_ownership_violation)", async () => {
    const first = await request(app)
      .post("/api/vauto-agent")
      .send({
        messages: [{ role: "user", text: "Ieškau BMW" }],
      });

    assert.equal(first.status, 200);
    const threadId = first.body.thread.threadId;

    const second = await request(app)
      .post("/api/vauto-agent")
      .send({
        threadId,
        // Missing anonSessionToken
        messages: [{ role: "user", text: "Tik dyzelinas" }],
      });

    assert.equal(second.status, 403);
    assert.equal(second.body.code, "thread_ownership_violation");
  });

  it("4. Guest continuation with wrong anonSessionToken fails closed (403 thread_ownership_violation)", async () => {
    const first = await request(app)
      .post("/api/vauto-agent")
      .send({
        messages: [{ role: "user", text: "Ieškau BMW" }],
      });

    assert.equal(first.status, 200);
    const threadId = first.body.thread.threadId;

    const second = await request(app)
      .post("/api/vauto-agent")
      .send({
        threadId,
        anonSessionToken: "forged-token-xyz",
        messages: [{ role: "user", text: "Tik dyzelinas" }],
      });

    assert.equal(second.status, 403);
    assert.equal(second.body.code, "thread_ownership_violation");
  });

  it("5. Guest A vs Guest B thread isolation: Guest B cannot mutate Guest A's thread", async () => {
    const resA = await request(app)
      .post("/api/vauto-agent")
      .send({ messages: [{ role: "user", text: "Guest A query" }] });
    const resB = await request(app)
      .post("/api/vauto-agent")
      .send({ messages: [{ role: "user", text: "Guest B query" }] });

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    const threadIdA = resA.body.thread.threadId;
    const tokenB = resB.body.thread.anonSessionToken;

    // Guest B uses their own token against Thread A
    const hijack = await request(app)
      .post("/api/vauto-agent")
      .send({
        threadId: threadIdA,
        anonSessionToken: tokenB,
        messages: [{ role: "user", text: "Hijack attempt" }],
      });

    assert.equal(hijack.status, 403);
    assert.equal(hijack.body.code, "thread_ownership_violation");
  });

  it("6. Capability gate: unauthenticated request with pending images returns 401 auth_required", async () => {
    const resUrls = await request(app)
      .post("/api/vauto-agent")
      .send({
        messages: [{ role: "user", text: "Parduodu prekę" }],
        context: {
          pendingImageUrls: ["https://example.com/car.jpg"],
        },
      });

    assert.equal(resUrls.status, 401);
    assert.equal(resUrls.body.code, "auth_required");

    const resCount = await request(app)
      .post("/api/vauto-agent")
      .send({
        messages: [{ role: "user", text: "Parduodu prekę" }],
        context: {
          pendingImageCount: 3,
        },
      });

    assert.equal(resCount.status, 401);
    assert.equal(resCount.body.code, "auth_required");
  });

  it("7. Capability gate: authenticated request with pending images passes the auth gate", async () => {
    const token = signAccessToken({ sub: "user-test-1", role: "private" });
    const res = await request(app)
      .post("/api/vauto-agent")
      .set("Authorization", `Bearer ${token}`)
      .send({
        messages: [{ role: "user", text: "Parduodu dviratį" }],
        context: {
          pendingImageUrls: ["https://example.com/bike.jpg"],
        },
      });

    assert.notEqual(res.status, 401, "Authenticated vision request must not return 401");
  });

  it("8. Thread claim lifecycle: unauthenticated claim rejected, invalid token rejected, valid claim succeeds, replay rejected", async () => {
    // 1. Create anonymous thread
    const anonRes = await request(app)
      .post("/api/vauto-agent")
      .send({
        messages: [{ role: "user", text: "Pradedu skelbimą anonimiškai" }],
      });
    assert.equal(anonRes.status, 200);
    const threadId = anonRes.body.thread.threadId;
    const anonToken = anonRes.body.thread.anonSessionToken;

    // 2. Unauthenticated claim -> 401
    const unauthedClaim = await request(app)
      .post(`/api/vauto-agent/threads/${threadId}/claim`)
      .send({ anonSessionToken: anonToken });
    assert.equal(unauthedClaim.status, 401);

    // 3. Claim without anonSessionToken -> 400
    const tokenUserA = signAccessToken({ sub: "user-A", role: "private" });
    const emptyTokenClaim = await request(app)
      .post(`/api/vauto-agent/threads/${threadId}/claim`)
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({});
    assert.equal(emptyTokenClaim.status, 400);

    // 4. Claim with wrong anonSessionToken -> 403
    const wrongTokenClaim = await request(app)
      .post(`/api/vauto-agent/threads/${threadId}/claim`)
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({ anonSessionToken: "wrong-token" });
    assert.equal(wrongTokenClaim.status, 403);
    assert.equal(wrongTokenClaim.body.code, "token_mismatch");

    // 5. Valid claim by User A -> 200
    const validClaim = await request(app)
      .post(`/api/vauto-agent/threads/${threadId}/claim`)
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({ anonSessionToken: anonToken });
    assert.equal(validClaim.status, 200);
    assert.equal(validClaim.body.ok, true);
    assert.equal(validClaim.body.threadId, threadId);

    // 6. Claim replay (claiming already bound thread) -> 403 already_bound
    const replayClaim = await request(app)
      .post(`/api/vauto-agent/threads/${threadId}/claim`)
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({ anonSessionToken: anonToken });
    assert.equal(replayClaim.status, 403);
    assert.equal(replayClaim.body.code, "already_bound");

    // 7. Old anon token continuation after claim -> 403
    const anonContinuation = await request(app)
      .post("/api/vauto-agent")
      .send({
        threadId,
        anonSessionToken: anonToken,
        messages: [{ role: "user", text: "Tęsiu su senu tokenu" }],
      });
    assert.equal(anonContinuation.status, 403);
    assert.equal(anonContinuation.body.code, "thread_ownership_violation");

    // 8. User B continuation of User A's thread -> 403
    const tokenUserB = signAccessToken({ sub: "user-B", role: "private" });
    const userBContinuation = await request(app)
      .post("/api/vauto-agent")
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        threadId,
        messages: [{ role: "user", text: "Aš esu User B" }],
      });
    assert.equal(userBContinuation.status, 403);
    assert.equal(userBContinuation.body.code, "thread_ownership_violation");

    // 9. User A (owner) continuation -> 200
    const ownerContinuation = await request(app)
      .post("/api/vauto-agent")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        threadId,
        messages: [{ role: "user", text: "Aš esu User A (savininkas)" }],
      });
    assert.equal(ownerContinuation.status, 200);
    assert.equal(ownerContinuation.body.thread.threadId, threadId);
  });

  it("9. Consequential actions route boundary remains strictly requireAuth", async () => {
    const unauthed = await request(app)
      .post("/api/consequential-actions/action-123/confirm")
      .send({});
    assert.equal(unauthed.status, 401);
  });

  it("10. SSE stream allows guest text chat and returns thread with anonSessionToken", async () => {
    const res = await request(app)
      .post("/api/vauto-agent/stream")
      .send({
        messages: [{ role: "user", text: "Ieškau ratlankių" }],
      });

    assert.equal(res.status, 200);
    assert.ok(res.text.includes("data: "), "Expected SSE data lines");
    assert.ok(res.text.includes('"anonSessionToken"'), "Expected anonSessionToken in stream result");
    assert.ok(!res.text.includes('"auth_required"'), "Guest text must not emit auth_required error");
  });

  it("11. SSE stream gates guest vision with auth_required error event", async () => {
    const res = await request(app)
      .post("/api/vauto-agent/stream")
      .send({
        messages: [{ role: "user", text: "Parduodu prekę" }],
        context: {
          pendingImageUrls: ["https://example.com/item.jpg"],
        },
      });

    assert.equal(res.status, 200);
    assert.ok(res.text.includes('"auth_required"'), "Stream must emit auth_required event for guest vision");
  });

  it("12. SSE stream allows authenticated user vision turn past auth gate", async () => {
    const token = signAccessToken({ sub: "user-stream-1", role: "private" });
    const res = await request(app)
      .post("/api/vauto-agent/stream")
      .set("Authorization", `Bearer ${token}`)
      .send({
        messages: [{ role: "user", text: "Parduodu dviratį" }],
        context: {
          pendingImageUrls: ["https://example.com/bike.jpg"],
        },
      });

    assert.equal(res.status, 200);
    assert.ok(!res.text.includes('"auth_required"'), "Authenticated vision turn must not emit auth_required");
  });
});
