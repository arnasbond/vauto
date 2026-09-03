/**
 * F10 P1-01 — adversarial: a client-declared privileged role can NEVER be
 * minted into a session/JWT. Elevated roles exist ONLY for server-allowlisted
 * identities; every other identity (including a forged legacy super_admin DB
 * row or a forged token) fails closed to "private".
 *
 * Real authRouter + supertest; the DB layer is stubbed through
 * `setUserStoreForTests` (same seam as the F9 authority tests). Google tokens
 * use the E2E mock passthrough (VAUTO_E2E_AUTH=1); OTP uses the demo bypass
 * (non-production NODE_ENV).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken, verifyAccessToken } from "../auth/tokens.js";
import { optionalAuth } from "../middleware/auth.js";
import { authRouter } from "../routes/auth.js";
import { setUserStoreForTests } from "../routes/user-store.js";
import { encodeE2eGoogleToken } from "../auth/e2e-mock-auth.js";
import type { ApiUser } from "../types.js";

function baseUser(overrides: Partial<ApiUser> = {}): ApiUser {
  return {
    id: "u1",
    name: "Vartotojas",
    phone: "+37060000001",
    city: "Vilnius",
    avatar: "https://cdn.example.com/avatar.png",
    email: "evil@example.com",
    role: "private",
    ...overrides,
  };
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api/auth", authRouter);
  app.use(
    (
      err: Error & { type?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err.type === "entity.too.large") {
        res.status(413).json({ ok: false, code: "payload_too_large" });
        return;
      }
      if (res.headersSent) return next(err);
      res.status(500).json({ ok: false, error: "Internal server error" });
    }
  );
  return app;
}

function decodeJwtRole(token: string): string | null {
  const payload = verifyAccessToken(token);
  if (!payload || typeof payload.role !== "string") return null;
  return payload.role;
}

describe("F10 P1-01 — login role escalation is fail-closed", () => {
  let users = new Map<string, ApiUser>();

  beforeEach(() => {
    users = new Map<string, ApiUser>();
    setUserStoreForTests({
      getUser: async (id: string) => users.get(id) ?? null,
      getUserByEmail: async (email: string) =>
        [...users.values()].find((u) => u.email === email) ?? null,
      getUserByPhoneDigits: async (digits: string) =>
        [...users.values()].find(
          (u) => (u.phone ?? "").replace(/\D/g, "") === digits
        ) ?? null,
      upsertUser: async (user: ApiUser) => {
        const existing = users.get(user.id);
        users.set(user.id, { ...(existing ?? {}), ...user });
      },
      attachReferralFields: async (user: ApiUser) => user,
      updateUserAvatar: async () => null,
    });
  });

  afterEach(() => {
    setUserStoreForTests({});
  });

  it("social: body role=super_admin (non-allowlisted) → JWT turi TIK private", async () => {
    process.env.VAUTO_E2E_AUTH = "1";
    const app = createApp();
    const idToken = encodeE2eGoogleToken({
      sub: "evil-google-1",
      email: "evil@example.com",
      name: "Evil User",
    });

    const res = await request(app).post("/api/auth/social").send({
      provider: "google",
      idToken,
      role: "super_admin",
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token, "session token issued");
    assert.equal(decodeJwtRole(res.body.token), "private");
    assert.equal(res.body.role, "private");
    const stored = [...users.values()].find(
      (u) => u.email === "evil@example.com"
    );
    assert.ok(stored);
    assert.equal(stored.role, "private", "no privileged DB row");
  });

  it("social: body role=admin (non-allowlisted) → 404 mask, no privileged session", async () => {
    process.env.VAUTO_E2E_AUTH = "1";
    const app = createApp();
    const idToken = encodeE2eGoogleToken({
      sub: "evil-google-2",
      email: "evil2@example.com",
      name: "Evil Two",
    });

    const res = await request(app).post("/api/auth/social").send({
      provider: "google",
      idToken,
      role: "admin",
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Not found");
  });

  it("otp/verify: body role=super_admin (demo phone) → JWT turi TIK private", async () => {
    const app = createApp();

    const res = await request(app).post("/api/auth/otp/verify").send({
      phone: "+37060000001",
      code: "123456",
      role: "super_admin",
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(decodeJwtRole(res.body.token), "private");
    const stored = [...users.values()].find((u) =>
      (u.phone ?? "").includes("37060000001")
    );
    assert.ok(stored);
    assert.equal(stored.role, "private");
  });

  it("otp/verify: forged legacy super_admin DB row be allowlist → login downgraduoja į private", async () => {
    users.set(
      "u1",
      baseUser({ id: "u1", phone: "+37060000001", role: "super_admin" })
    );
    const app = createApp();

    const res = await request(app).post("/api/auth/otp/verify").send({
      phone: "+37060000001",
      code: "123456",
      role: "private",
    });

    assert.equal(res.status, 200);
    assert.equal(decodeJwtRole(res.body.token), "private");
  });

  it("allowlisted administrator vis tiek gauna super_admin", async () => {
    process.env.VAUTO_E2E_AUTH = "1";
    const app = createApp();
    const idToken = encodeE2eGoogleToken({
      sub: "admin-google-1",
      email: "admin@vauto.com",
      name: "VAUTO Admin",
    });

    const res = await request(app).post("/api/auth/social").send({
      provider: "google",
      idToken,
      role: "admin",
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(decodeJwtRole(res.body.token), "super_admin");
  });

  it("nežinoma body role (emperor) → private", async () => {
    const app = createApp();
    const res = await request(app).post("/api/auth/otp/verify").send({
      phone: "+37060000001",
      code: "123456",
      role: "emperor",
    });
    assert.equal(res.status, 200);
    assert.equal(decodeJwtRole(res.body.token), "private");
  });

  it("refresh: forged super_admin token + non-allowlisted identity → refresh downgraduoja", async () => {
    users.set("u1", baseUser({ id: "u1", role: "private" }));
    const app = createApp();
    const forgedToken = signAccessToken({
      sub: "u1",
      role: "super_admin",
      provider: "phone",
    });

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Authorization", `Bearer ${forgedToken}`);

    assert.equal(res.status, 200);
    assert.equal(decodeJwtRole(res.body.token), "private");
  });
});
