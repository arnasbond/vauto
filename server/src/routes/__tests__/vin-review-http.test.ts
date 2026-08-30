/**
 * Phase 2C Round 4 — authenticated HTTP tests for the server-registered VIN
 * review challenge boundary.
 *
 * Direct HTTP evidence (not helper-only): register → confirm → receipt →
 * finalize, plus cross-user isolation at the real request boundary (two
 * different signed tokens), ownership checks for listing-bound challenges,
 * and every safe-failure path.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import express from "express";
import request from "supertest";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth } from "../../middleware/auth.js";
import { vinReviewRouter, setVinReviewOwnershipCheckForTests } from "../vin-review.js";
import {
  resetVinChallengeBoundaryForTests,
} from "../../vehicle/vin-challenge.js";
import {
  finalizeCreateVinAuthority,
  finalizePatchVinAuthority,
  __vinConfirmationTestSecrets,
} from "../../vehicle/vin-confirmation.js";

const VALID_A = "WBAZZZ8VZM1234567";
const VALID_B = "VF3XXXXXXXXX99999";
const LISTING_1 = "l-owned-by-a";

function createApp() {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use(optionalAuth);
  app.use("/api/vin-review", vinReviewRouter);
  return app;
}

function authHeader(userId: string) {
  return `Bearer ${signAccessToken({ sub: userId, role: "private", provider: "phone" })}`;
}

const app = createApp();

describe("HTTP /api/vin-review — server-registered challenge boundary", () => {
  beforeEach(() => {
    resetVinChallengeBoundaryForTests();
    __vinConfirmationTestSecrets("test-vin-confirm-secret-round-4");
    setVinReviewOwnershipCheckForTests(async (listingId, userId) => {
      return listingId === LISTING_1 && userId === "user-a";
    });
  });

  it("REQUIRED 14/19: manual register → explicit confirm → receipt persists at the final boundary", async () => {
    const reg = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_A] });
    assert.equal(reg.status, 200);
    assert.equal(reg.body.outcome, "registered");
    assert.ok(reg.body.challenge.challengeId);
    assert.ok(reg.body.attributes.vinChallenge);
    assert.ok(reg.body.attributes.vinReviewId, "register mints the server review generation");

    const confirm = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: reg.body.challenge.challengeId, value: VALID_A });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.outcome, "confirmed");
    assert.ok(confirm.body.attributes.vinConfirmationReceipt, "confirm mints the receipt");

    const persisted = finalizeCreateVinAuthority(confirm.body.attributes, "user-a");
    assert.equal(persisted.vin, VALID_A);
    assert.equal(persisted.vinChallenge, undefined);
  });

  it("REQUIRED 1/2: invented reviewId + plausible VIN cannot obtain a receipt (HTTP)", async () => {
    const res = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: "vc_invented", value: VALID_A });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "challenge_not_found");
    assert.equal(res.body.vinConfirmationReceipt, undefined);
  });

  it("REQUIRED 2: confirm without any challenge fails", async () => {
    const res = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ value: VALID_A });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "challenge_not_found");
  });

  it("REQUIRED 3: tampered challenge fails (HTTP)", async () => {
    const reg = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_A] });
    const tampered =
      String(reg.body.challenge.challengeId).slice(0, -1) +
      (String(reg.body.challenge.challengeId).endsWith("0") ? "1" : "0");
    const res = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: tampered, value: VALID_A });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "challenge_not_found");
  });

  it("REQUIRED 8/9: wrong VIN and non-permitted conflict choice fail (HTTP)", async () => {
    const reg = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_A, VALID_B] });
    const wrongVin = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: reg.body.challenge.challengeId, value: "1HGCM82633A004352" });
    assert.equal(wrongVin.status, 400);
    assert.equal(wrongVin.body.code, "choice_not_allowed");
  });

  it("REQUIRED 22: cross-user isolation at the real HTTP boundary (user B's challenge never confirms for A)", async () => {
    const reg = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-b"))
      .send({ values: [VALID_A] });
    assert.equal(reg.status, 200);

    const confirmAsA = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: reg.body.challenge.challengeId, value: VALID_A });
    assert.equal(confirmAsA.status, 400);
    assert.equal(confirmAsA.body.code, "wrong_user");

    const persistedForA = finalizeCreateVinAuthority(confirmAsA.body.attributes ?? {}, "user-a");
    assert.equal(persistedForA.vin, undefined);
  });

  it("REQUIRED 17: listing ownership is checked before listing-bound registration", async () => {
    const owned = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_A], listingId: LISTING_1 });
    assert.equal(owned.status, 200);

    const notOwned = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-b"))
      .send({ values: [VALID_A], listingId: LISTING_1 });
    assert.equal(notOwned.status, 403);
    assert.equal(notOwned.body.code, "wrong_listing");

    const missing = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_A], listingId: "l-does-not-exist" });
    assert.equal(missing.status, 403);
  });

  it("REQUIRED 18: valid listing-bound confirmation persists the replacement VIN on PATCH", async () => {
    const reg = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_B], listingId: LISTING_1 });
    const confirm = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: reg.body.challenge.challengeId, value: VALID_B, listingId: LISTING_1 });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.outcome, "confirmed");

    const patched = finalizePatchVinAuthority(confirm.body.attributes, {
      userId: "user-a",
      listingId: LISTING_1,
      existingVin: VALID_A,
    });
    assert.equal(patched.vin, VALID_B, "listing-bound receipt authorizes the replacement");
  });

  it("REQUIRED 19: an unbound create receipt must not authorize a listing PATCH", async () => {
    const reg = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_B] });
    const confirm = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: reg.body.challenge.challengeId, value: VALID_B });
    const patched = finalizePatchVinAuthority(confirm.body.attributes, {
      userId: "user-a",
      listingId: LISTING_1,
      existingVin: VALID_A,
    });
    assert.equal(patched.vin, undefined);
  });

  it("REQUIRED 12: safe retry — the same confirm replay returns the same receipt (HTTP)", async () => {
    const reg = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_A] });
    const first = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: reg.body.challenge.challengeId, value: VALID_A });
    const replay = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: reg.body.challenge.challengeId, value: VALID_A });
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.outcome, "already_confirmed");
    assert.deepEqual(replay.body.attributes, first.body.attributes);
  });

  it("REQUIRED 10/11: replacing the candidate invalidates the old challenge automatically (same draft scope, no hints)", async () => {
    const regA = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_A] });
    assert.equal(regA.status, 200);
    const draftScope = regA.body.draftScope;
    assert.ok(draftScope, "register must return the server-owned draft scope");

    // Replacement: register B for the SAME server scope WITHOUT supersede fields:
    const regB = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_B], draftScope });
    assert.equal(regB.status, 200);

    const staleConfirm = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: regA.body.challenge.challengeId, value: VALID_A, draftScope });
    assert.equal(staleConfirm.status, 400);
    assert.equal(staleConfirm.body.code, "stale_generation");
    assert.equal(staleConfirm.body.vinConfirmationReceipt, undefined, "failed confirm leaks no authority");
  });

  it("REQUIRED 16: reject invalidates the challenge; later confirm fails (HTTP)", async () => {
    const reg = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: [VALID_A] });
    const reject = await request(app)
      .post("/api/vin-review/reject")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: reg.body.challenge.challengeId });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.outcome, "rejected");

    const confirm = await request(app)
      .post("/api/vin-review/confirm")
      .set("Authorization", authHeader("user-a"))
      .send({ challengeId: reg.body.challenge.challengeId, value: VALID_A });
    assert.equal(confirm.status, 400);
    assert.equal(confirm.body.code, "challenge_not_found");
  });

  it("401s unauthenticated on all three endpoints", async () => {
    for (const path of ["/api/vin-review/register", "/api/vin-review/confirm", "/api/vin-review/reject"]) {
      const res = await request(app).post(path).send({});
      assert.equal(res.status, 401, `${path} must require auth`);
    }
  });

  it("400s for implausible VINs on register", async () => {
    const res = await request(app)
      .post("/api/vin-review/register")
      .set("Authorization", authHeader("user-a"))
      .send({ values: ["NOTAVIN"] });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "invalid_value");
  });
});
