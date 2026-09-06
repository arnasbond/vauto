/**
 * P0 — admin identity privilege-escalation hardening (adversarial HTTP).
 *
 * A plain user must NEVER gain admin/super_admin through profile mutations:
 * the authoritative auth email is server-managed identity provenance, display
 * names can never elevate, and a forged DB elevated role without verified
 * identity stays fail-closed. Legitimate server-verified admin flows keep
 * working. Uses the in-memory user store swap — no database, no production
 * writes.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import request from "supertest";

import { signAccessToken, verifyAccessToken } from "../../auth/tokens.js";
import { optionalAuth, userIsAdmin } from "../../middleware/auth.js";
import { apiRouter } from "../api.js";
import { authRouter } from "../auth.js";
import { setUserStoreForTests } from "../user-store.js";
import type { ApiUser } from "../../types.js";

function createApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api", apiRouter);
  app.use("/api/auth", authRouter);
  return app;
}

const app = createApp();

function baseUser(overrides: Partial<ApiUser> = {}): ApiUser {
  return {
    id: "user-1",
    name: "Vartotojas",
    phone: "+37060000000",
    city: "Vilnius",
    avatar: "https://cdn.example.com/avatar.png",
    email: "user@example.com",
    role: "private",
    warned: false,
    walletBalance: 0,
    soldCount: 0,
    authProvider: "google",
    profileType: "private",
    ...overrides,
  };
}

const editablePatch = { city: "Kaišiadorys", phone: "+37060000001" };

describe("P0 — admin identity privilege-escalation hardening", () => {
  let users = new Map<string, ApiUser>();

  const installStore = () => {
    users = new Map<string, ApiUser>();
    setUserStoreForTests({
      getUser: async (id: string) => users.get(id) ?? null,
      upsertUser: async (user: ApiUser) => {
        const existing = users.get(user.id) ?? baseUser({ id: user.id });
        users.set(user.id, { ...existing, ...user });
      },
      updateUserAvatar: async (userId: string, avatarUrl: string) => {
        const existing = users.get(userId);
        if (existing) {
          users.set(userId, { ...existing, avatar: avatarUrl });
        }
        return existing ?? null;
      },
    });
  };

  afterEach(() => {
    setUserStoreForTests({});
    delete process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_NAMES;
  });

  it("private vartotojas PUT savo profilį su ADMIN_EMAIL → email NEPersistinamas, role lieka private", async () => {
    installStore();
    users.set("user-1", baseUser());
    const token = signAccessToken({ sub: "user-1", role: "private" });

    const res = await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), email: "admin@vauto.com", ...editablePatch });

    assert.equal(res.status, 200);
    assert.equal(users.get("user-1")?.email, "user@example.com");
    assert.equal(users.get("user-1")?.role, "private");
    assert.equal(users.get("user-1")?.city, "Kaišiadorys");
  });

  it("po ADMIN_EMAIL bandymo /auth/session lieka private", async () => {
    installStore();
    users.set("user-1", baseUser());
    const token = signAccessToken({ sub: "user-1", role: "private" });

    await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), email: "admin@vauto.com", ...editablePatch });

    const session = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(session.status, 200);
    assert.equal(session.body.role, "private");
    assert.equal(session.body.user.email, "user@example.com");
  });

  it("po ADMIN_EMAIL bandymo /auth/refresh išduoda private tokeną", async () => {
    installStore();
    users.set("user-1", baseUser());
    const token = signAccessToken({ sub: "user-1", role: "private" });

    await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), email: "admin@vauto.com", ...editablePatch });

    const refresh = await request(app)
      .post("/api/auth/refresh")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(refresh.status, 200);
    const payload = verifyAccessToken(String(refresh.body.token));
    assert.equal(payload?.role, "private");
  });

  it("ADMIN_EMAILS papildomas adresas per profilį → neeskaluoja", async () => {
    installStore();
    process.env.ADMIN_EMAILS = "ops@vauto.com,extra@vauto.com";
    users.set("user-1", baseUser());
    const token = signAccessToken({ sub: "user-1", role: "private" });

    await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), email: "ops@vauto.com", ...editablePatch });

    assert.equal(users.get("user-1")?.email, "user@example.com");
    const session = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(session.body.role, "private");
  });

  it("name/nickname profilio keitimas NIEKADA neeskaluoja, net su ADMIN_NAMES", async () => {
    installStore();
    process.env.ADMIN_NAMES = "arnas";
    users.set("user-1", baseUser());
    const token = signAccessToken({ sub: "user-1", role: "private" });

    await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), name: "Arnas", nickname: "Arnas", ...editablePatch });

    const session = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(session.body.role, "private");

    const adminCheck = await userIsAdmin({
      authUserId: "user-1",
      authRole: "admin",
    } as Parameters<typeof userIsAdmin>[0]);
    assert.equal(adminCheck, false);
  });

  it("teisėtas, server-verified admin identity login vis dar veikia", async () => {
    installStore();
    users.set(
      "admin-1",
      baseUser({ id: "admin-1", email: "admin@vauto.com", role: "admin" })
    );
    const token = signAccessToken({ sub: "admin-1", role: "admin" });

    const session = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(session.status, 200);
    assert.equal(session.body.role, "super_admin");

    const adminCheck = await userIsAdmin({
      authUserId: "admin-1",
      authRole: "admin",
    } as Parameters<typeof userIsAdmin>[0]);
    assert.equal(adminCheck, true);
  });

  it("forged DB super_admin be verified identity lieka fail-closed", async () => {
    installStore();
    users.set(
      "user-9",
      baseUser({ id: "user-9", role: "super_admin", email: "user@example.com" })
    );
    const privateToken = signAccessToken({ sub: "user-9", role: "private" });

    const session = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${privateToken}`);
    assert.equal(session.body.role, "private");

    const forgedSuperAdminToken = signAccessToken({
      sub: "user-9",
      role: "super_admin",
    });
    const adminCheck = await userIsAdmin({
      authUserId: "user-9",
      authRole: "super_admin",
    } as Parameters<typeof userIsAdmin>[0]);
    assert.equal(adminCheck, false);
    const forgedSession = await request(app)
      .get("/api/auth/session")
      .set("Authorization", `Bearer ${forgedSuperAdminToken}`);
    assert.equal(forgedSession.body.role, "private");
  });
});
