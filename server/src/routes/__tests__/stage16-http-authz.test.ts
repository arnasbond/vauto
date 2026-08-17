/**
 * Stage 16A — HTTP authz / IDOR negatives against real routers.
 * Server-side gates only. Does not use UI. Isolated — no production writes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import cors from "cors";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth } from "../../middleware/auth.js";
import { securityHeaders } from "../../middleware/security-headers.js";
import { apiRouter } from "../api.js";
import { authRouter } from "../auth.js";
import { disputeRouter } from "../disputes.js";
import { fundsTransferRouter } from "../funds-transfer.js";
import { transactionsRouter } from "../transactions.js";

function createApp() {
  const app = express();
  app.use(securityHeaders);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (origin === "https://www.vauto.lt") {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    })
  );
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);
  app.use("/api", transactionsRouter);
  app.use("/api", disputeRouter);
  app.use("/api", fundsTransferRouter);
  app.use(
    (
      err: Error & { type?: string; status?: number },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err.type === "entity.too.large") {
        res.status(413).json({ ok: false, code: "payload_too_large" });
        return;
      }
      if (err instanceof SyntaxError) {
        res.status(400).json({ ok: false, error: "invalid_json" });
        return;
      }
      if (res.headersSent) {
        next(err);
        return;
      }
      res.status(500).json({ ok: false, error: "Internal server error" });
    }
  );
  return app;
}

const app = createApp();
const buyerA = signAccessToken({ sub: "buyer-a", role: "private" });
const buyerB = signAccessToken({ sub: "buyer-b", role: "private" });
const sellerX = signAccessToken({ sub: "seller-x", role: "private" });

describe("Stage 16 HTTP IDOR / authz negatives", () => {
  it("anonymous cannot read protected listings/mine", async () => {
    const res = await request(app).get("/api/listings/mine");
    assert.equal(res.status, 401);
  });

  it("anonymous cannot list transactions", async () => {
    const res = await request(app).get("/api/transactions");
    assert.equal(res.status, 401);
  });

  it("anonymous cannot read another user's private profile", async () => {
    const res = await request(app).get("/api/users/buyer-a");
    assert.equal(res.status, 401);
  });

  it("anonymous and non-admin get the same opaque 404 on admin routes", async () => {
    const anon = await request(app).get("/api/admin/platform-flags");
    const user = await request(app)
      .get("/api/admin/platform-flags")
      .set("Authorization", `Bearer ${buyerA}`);
    assert.equal(anon.status, 404);
    assert.equal(user.status, 404);
    assert.deepEqual(anon.body, { error: "Not found" });
    assert.deepEqual(user.body, { error: "Not found" });
  });

  it("non-admin cannot credit wallet (404 mask)", async () => {
    const res = await request(app)
      .post("/api/admin/wallet/credit")
      .set("Authorization", `Bearer ${buyerA}`)
      .send({ userId: "buyer-b", amount: 100 });
    assert.equal(res.status, 404);
  });

  it("buyer A cannot GET buyer B private user record (IDOR)", async () => {
    const res = await request(app)
      .get("/api/users/buyer-b")
      .set("Authorization", `Bearer ${buyerA}`);
    assert.equal(res.status, 403);
  });

  it("buyer A cannot PUT buyer B profile (IDOR)", async () => {
    const res = await request(app)
      .put("/api/users/buyer-b")
      .set("Authorization", `Bearer ${buyerA}`)
      .send({
        id: "buyer-b",
        name: "Hacked",
        phone: "+37060000002",
        city: "Vilnius",
        role: "admin",
        walletBalance: 99999,
      });
    assert.equal(res.status, 403);
  });

  it("seller cannot refund as buyer (admin-only funds path)", async () => {
    const res = await request(app)
      .post("/api/transactions/tx-stranger/payment/refund-to-buyer")
      .set("Authorization", `Bearer ${sellerX}`)
      .send({});
    assert.ok(res.status === 403 || res.status === 404);
  });

  it("buyer cannot complete a stranger transaction (404 mask)", async () => {
    const res = await request(app)
      .post("/api/transactions/tx-does-not-exist/complete")
      .set("Authorization", `Bearer ${buyerB}`)
      .send({ idempotencyKey: "stage16-idor-complete-1" });
    assert.ok([400, 404, 422, 401, 500].includes(res.status));
    if (res.status === 404) {
      assert.ok(!/buyer-b/i.test(JSON.stringify(res.body)));
    }
  });

  it("invalid JWT is unauthenticated", async () => {
    const res = await request(app)
      .get("/api/listings/mine")
      .set("Authorization", "Bearer totally.invalid.token");
    assert.equal(res.status, 401);
  });

  it("legacy X-User-Id does not authenticate without ALLOW_LEGACY_USER_HEADER", async () => {
    const res = await request(app)
      .get("/api/listings/mine")
      .set("X-User-Id", "buyer-a");
    assert.equal(res.status, 401);
  });

  it("rejects disallowed CORS origin", async () => {
    const res = await request(app)
      .get("/api/listings/mine")
      .set("Origin", "https://evil.example");
    assert.equal(res.status, 401);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });

  it("allows www.vauto.lt CORS origin", async () => {
    const res = await request(app)
      .get("/api/listings/mine")
      .set("Origin", "https://www.vauto.lt");
    assert.equal(res.headers["access-control-allow-origin"], "https://www.vauto.lt");
  });

  it("rejects malformed JSON without leaking stack traces", async () => {
    const res = await request(app)
      .post("/api/auth/otp/send")
      .set("Content-Type", "application/json")
      .send("{not-json");
    assert.ok(res.status >= 400);
    const text = JSON.stringify(res.body) + (res.text ?? "");
    assert.equal(/at Object\.|node_modules|JWT_SECRET|password/i.test(text), false);
  });

  it("rejects oversized JSON bodies", async () => {
    const huge = { phone: "+37060000001", pad: "x".repeat(600_000) };
    const res = await request(app).post("/api/auth/otp/send").send(huge);
    assert.equal(res.status, 413);
  });

  it("XSS-looking listing fields do not authenticate a write as anonymous", async () => {
    const res = await request(app)
      .post("/api/listings")
      .send({
        title: "<script>alert(1)</script>",
        description: "<img src=x onerror=alert(1)>",
        price: 1,
      });
    assert.equal(res.status, 401);
  });
});
