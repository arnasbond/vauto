import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { securityHeaders } from "../security-headers.js";

function app() {
  const e = express();
  e.use(securityHeaders);
  e.get("/api/health", (_req, res) => res.json({ ok: true }));
  e.get("/api/auth/session", (_req, res) => res.json({ ok: true }));
  e.get("/api/users/u1", (_req, res) => res.json({ ok: true }));
  return e;
}

describe("Stage 16 security headers", () => {
  it("sets clickjacking and MIME sniffing headers on API responses", async () => {
    const res = await request(app()).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.equal(res.headers["content-security-policy"], "frame-ancestors 'none'");
    assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin");
  });

  it("does not cache auth or user payloads", async () => {
    const session = await request(app()).get("/api/auth/session");
    assert.equal(session.headers["cache-control"], "no-store");
    const user = await request(app()).get("/api/users/u1");
    assert.equal(user.headers["cache-control"], "no-store");
  });

  it("sets HSTS when X-Forwarded-Proto is https", async () => {
    const res = await request(app())
      .get("/api/health")
      .set("X-Forwarded-Proto", "https");
    assert.match(
      String(res.headers["strict-transport-security"] ?? ""),
      /max-age=63072000/
    );
  });
});
