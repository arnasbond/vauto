import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signAccessToken, verifyAccessToken } from "../tokens.js";

describe("Stage 16 JWT verify", () => {
  it("accepts a token signed with the current secret", () => {
    const token = signAccessToken({ sub: "u1", role: "private" });
    const payload = verifyAccessToken(token);
    assert.equal(payload?.sub, "u1");
    assert.equal(payload?.role, "private");
  });

  it("rejects a tampered payload", () => {
    const token = signAccessToken({ sub: "u1", role: "private" });
    const parts = token.split(".");
    const body = Buffer.from(
      JSON.stringify({ sub: "u1", role: "super_admin", exp: Date.now() + 60_000 })
    ).toString("base64url");
    assert.equal(verifyAccessToken(`${parts[0]}.${body}.${parts[2]}`), null);
  });

  it("rejects alg-none style tokens", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" })
    ).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ sub: "u1", role: "super_admin", exp: Date.now() + 60_000 })
    ).toString("base64url");
    assert.equal(verifyAccessToken(`${header}.${body}.`), null);
  });
});
