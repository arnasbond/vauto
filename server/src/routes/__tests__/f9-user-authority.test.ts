/**
 * F9 — user profile authority boundary (adversarial HTTP).
 * Server-side gates only, no UI, no production writes. The user store is
 * swapped for an in-memory Map via `setUserStoreForTests`, so the
 * plain-user vs admin authority semantics are exercised against the REAL
 * apiRouter without a database.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth } from "../../middleware/auth.js";
import { apiRouter } from "../api.js";
import { setUserStoreForTests } from "../user-store.js";
import type { ApiUser } from "../../types.js";

function createApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api", apiRouter);
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

describe("F9 — profile update authority boundary", () => {
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
    // Restore production store wiring for other suites.
    setUserStoreForTests({});
  });

  it("super_admin gali išsaugoti leistinus laukus be „role is invalid“", async () => {
    installStore();
    users.set("admin-1", baseUser({ id: "admin-1", role: "super_admin" }));
    const token = signAccessToken({ sub: "admin-1", role: "super_admin" });

    // Whitelisted client shape: NO role/id/authority fields in the body.
    const res = await request(app)
      .put("/api/users/admin-1")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Vartotojas",
        phone: "+37060000000",
        city: "Kaišiadorys",
        avatar: "https://cdn.example.com/avatar.png",
        email: "user@example.com",
      });

    assert.equal(res.status, 200);
    assert.equal(users.get("admin-1")?.role, "super_admin");
    assert.equal(users.get("admin-1")?.city, "Kaišiadorys");
  });

  it("private vartotojo body role: super_admin → jokio pakėlimo, serverio rolė lieka", async () => {
    installStore();
    users.set("user-1", baseUser());
    const token = signAccessToken({ sub: "user-1", role: "private" });

    const res = await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), role: "super_admin", ...editablePatch });

    assert.equal(res.status, 200);
    assert.equal(users.get("user-1")?.role, "private");
    assert.equal(users.get("user-1")?.city, "Kaišiadorys");
  });

  it("token role vs body role konfliktas → laimi serverio autoritetas (DB rolė)", async () => {
    installStore();
    users.set("user-1", baseUser({ role: "pro" }));
    const token = signAccessToken({ sub: "user-1", role: "private" });

    const res = await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), role: "admin", ...editablePatch });

    assert.equal(res.status, 200);
    assert.equal(users.get("user-1")?.role, "pro");
  });

  it("nežinoma role reikšmė → 400, profilis nesugadintas", async () => {
    installStore();
    users.set("user-1", baseUser());
    const token = signAccessToken({ sub: "user-1", role: "private" });

    const res = await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), role: "emperor", ...editablePatch });

    assert.equal(res.status, 400);
    assert.equal(users.get("user-1")?.role, "private");
    assert.equal(users.get("user-1")?.city, "Vilnius");
  });

  it("private vartotojas siunčia kito vartotojo id → 403", async () => {
    installStore();
    users.set("user-1", baseUser());
    users.set("user-2", baseUser({ id: "user-2" }));
    const token = signAccessToken({ sub: "user-2", role: "private" });

    const res = await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), ...editablePatch });

    assert.equal(res.status, 403);
    assert.equal(users.get("user-1")?.city, "Vilnius");
  });

  it("body id skiriasi nuo URL id → URL (serverio) autoritetas laimi", async () => {
    installStore();
    users.set("user-1", baseUser());
    const token = signAccessToken({ sub: "user-1", role: "private" });

    const res = await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), id: "user-99", ...editablePatch });

    assert.equal(res.status, 200);
    assert.equal(users.get("user-1")?.city, "Kaišiadorys");
    assert.equal(users.has("user-99"), false);
  });

  it("nežinomas profilio laukas → 400 fail-closed (niekas tyliai nenutyla)", async () => {
    installStore();
    users.set("user-1", baseUser());
    const token = signAccessToken({ sub: "user-1", role: "private" });

    const res = await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseUser(), isGodMode: true, ...editablePatch });

    assert.equal(res.status, 400);
    assert.match(res.body.error ?? "", /Unknown field/);
    assert.equal(users.get("user-1")?.city, "Vilnius");
  });

  it("AI pokalbio profil-auto-save (phone+city patch) nebemeta role is invalid", async () => {
    installStore();
    users.set("admin-1", baseUser({ id: "admin-1", role: "super_admin" }));
    const token = signAccessToken({ sub: "admin-1", role: "super_admin" });

    // Same shape the client whitelist sends for a chat-extracted contact.
    const res = await request(app)
      .put("/api/users/admin-1")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Vartotojas",
        phone: "+37060000002",
        city: "Kaišiadorys",
        avatar: "https://cdn.example.com/avatar.png",
        email: "user@example.com",
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(users.get("admin-1")?.phone, "+37060000002");
    assert.equal(users.get("admin-1")?.city, "Kaišiadorys");
    assert.equal(users.get("admin-1")?.role, "super_admin");
  });

  it("admin kelias yra aiškiai autorizuotas: admin gali keisti rolę, private negali", async () => {
    installStore();
    users.set("user-1", baseUser());
    const adminToken = signAccessToken({ sub: "admin-1", role: "admin" });

    const adminRes = await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...baseUser(), role: "pro", ...editablePatch });
    assert.equal(adminRes.status, 200);
    assert.equal(users.get("user-1")?.role, "pro");

    const privateToken = signAccessToken({ sub: "user-1", role: "private" });
    const privateRes = await request(app)
      .put("/api/users/user-1")
      .set("Authorization", `Bearer ${privateToken}`)
      .send({ ...baseUser(), role: "super_admin", ...editablePatch });
    assert.equal(privateRes.status, 200);
    assert.equal(users.get("user-1")?.role, "pro");
  });
});
