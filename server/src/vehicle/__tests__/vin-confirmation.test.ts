/**
 * Phase 2C Round 3 — server-owned VIN confirmation authority (receipt lifecycle).
 *
 * Integration-level tests (not helper-only): real HMAC mint/verify, expiry,
 * cross-user/cross-listing/cross-VIN/cross-reviewId binding, tamper detection,
 * replay idempotency, and the exact production composition used by the agent
 * flow (server challenge → reducer → authority → finalize boundary).
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildConfirmedVinAttributesPatch,
  finalizeCreateVinAuthority,
  mintVinConfirmation,
  verifyVinConfirmation,
  __vinConfirmationTestSecrets,
} from "../vin-confirmation.js";
import {
  consumeVinChallenge,
  ensureVinReviewChallenge,
  resetVinChallengeBoundaryForTests,
} from "../vin-challenge.js";
import {
  applyVinExtractionCandidate,
  applyVinStructuredReviewAction,
  deriveVinReviewState,
  redactVinReviewForModel,
  stripUntrustedVinMarkers,
} from "../vin-review.js";

const VALID_A = "WBAZZZ8VZM1234567";
const VALID_B = "VF3XXXXXXXXX99999";
const USER_A = "user-a";
const USER_B = "user-b";
const LISTING_1 = "l-1";
const LISTING_2 = "l-2";

describe("Phase 2C R3 — receipt mint/verify lifecycle", () => {
  beforeEach(() => {
    __vinConfirmationTestSecrets("test-vin-confirm-secret-round-3");
  });

  it("mints a receipt bound to user + vin + reviewId (+ optional listingId) and verifies it", () => {
    const attrs = mintVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_1",
      listingId: LISTING_1,
    })!;
    const result = verifyVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_1",
      listingId: LISTING_1,
      receipt: attrs.vinConfirmationReceipt,
      issuedAt: attrs.vinConfirmationIssuedAt,
      expiresAt: attrs.vinConfirmationExpiresAt,
    });
    assert.equal(result.ok, true);
  });

  it("REQUIRED 8: receipt for another user fails", () => {
    const attrs = mintVinConfirmation({ userId: USER_A, vin: VALID_A, reviewId: "vr_1" })!;
    const result = verifyVinConfirmation({
      userId: USER_B,
      vin: VALID_A,
      reviewId: "vr_1",
      receipt: attrs.vinConfirmationReceipt,
      issuedAt: attrs.vinConfirmationIssuedAt,
      expiresAt: attrs.vinConfirmationExpiresAt,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "tampered");
  });

  it("REQUIRED 9: receipt for another listing fails", () => {
    const attrs = mintVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_1",
      listingId: LISTING_1,
    })!;
    const result = verifyVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_1",
      listingId: LISTING_2,
      receipt: attrs.vinConfirmationReceipt,
      issuedAt: attrs.vinConfirmationIssuedAt,
      expiresAt: attrs.vinConfirmationExpiresAt,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "tampered");
  });

  it("REQUIRED 10: receipt for another VIN fails", () => {
    const attrs = mintVinConfirmation({ userId: USER_A, vin: VALID_A, reviewId: "vr_1" })!;
    const result = verifyVinConfirmation({
      userId: USER_A,
      vin: VALID_B,
      reviewId: "vr_1",
      receipt: attrs.vinConfirmationReceipt,
      issuedAt: attrs.vinConfirmationIssuedAt,
      expiresAt: attrs.vinConfirmationExpiresAt,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "tampered");
  });

  it("REQUIRED 11: receipt for another reviewId fails", () => {
    const attrs = mintVinConfirmation({ userId: USER_A, vin: VALID_A, reviewId: "vr_1" })!;
    const result = verifyVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_2",
      receipt: attrs.vinConfirmationReceipt,
      issuedAt: attrs.vinConfirmationIssuedAt,
      expiresAt: attrs.vinConfirmationExpiresAt,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "tampered");
  });

  it("REQUIRED 12: expired receipt fails", () => {
    const attrs = mintVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_1",
      nowMs: Date.now() - 25 * 60 * 60 * 1000,
      ttlOverrideMs: 60 * 1000,
    })!;
    const result = verifyVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_1",
      receipt: attrs.vinConfirmationReceipt,
      issuedAt: attrs.vinConfirmationIssuedAt,
      expiresAt: attrs.vinConfirmationExpiresAt,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "expired");
  });

  it("REQUIRED 13: tampered receipt fails", () => {
    const attrs = mintVinConfirmation({ userId: USER_A, vin: VALID_A, reviewId: "vr_1" })!;
    const receipt = attrs.vinConfirmationReceipt;
    const tampered =
      receipt.slice(0, receipt.length - 1) +
      (receipt.endsWith("0") ? "1" : "0");
    const result = verifyVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_1",
      receipt: tampered,
      issuedAt: attrs.vinConfirmationIssuedAt,
      expiresAt: attrs.vinConfirmationExpiresAt,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "tampered");
  });

  it("tampered issuance/expiry metadata fails", () => {
    const attrs = mintVinConfirmation({ userId: USER_A, vin: VALID_A, reviewId: "vr_1" })!;
    const result = verifyVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_1",
      receipt: attrs.vinConfirmationReceipt,
      issuedAt: String(Number(attrs.vinConfirmationIssuedAt) + 5),
      expiresAt: attrs.vinConfirmationExpiresAt,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "tampered");
  });

  it("missing/garbage receipt fails safely", () => {
    const result = verifyVinConfirmation({
      userId: USER_A,
      vin: VALID_A,
      reviewId: "vr_1",
      receipt: "",
      issuedAt: "1",
      expiresAt: "99999999999",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing_receipt");
  });

  it("mint refuses implausible VINs, empty reviewIds and empty user ids", () => {
    assert.equal(mintVinConfirmation({ userId: USER_A, vin: "NOPE", reviewId: "vr_1" }), null);
    assert.equal(mintVinConfirmation({ userId: USER_A, vin: VALID_A, reviewId: "" }), null);
    assert.equal(mintVinConfirmation({ userId: "", vin: VALID_A, reviewId: "vr_1" }), null);
  });

  it("REQUIRED 16: replay/idempotent verification is safe (repeated verification of the same receipt)", () => {
    const attrs = mintVinConfirmation({ userId: USER_A, vin: VALID_A, reviewId: "vr_1" })!;
    for (let i = 0; i < 3; i++) {
      const result = verifyVinConfirmation({
        userId: USER_A,
        vin: VALID_A,
        reviewId: "vr_1",
        receipt: attrs.vinConfirmationReceipt,
        issuedAt: attrs.vinConfirmationIssuedAt,
        expiresAt: attrs.vinConfirmationExpiresAt,
      });
      assert.equal(result.ok, true, `verification #${i + 1} must succeed identically`);
    }
  });
});

describe("Phase 2C R4 — production composition (challenge → reducer → authority → finalize)", () => {
  beforeEach(() => {
    resetVinChallengeBoundaryForTests();
    __vinConfirmationTestSecrets("test-vin-confirm-secret-round-4");
  });

  it("REQUIRED 19/20: agent-card explicit confirmation completes through the server authority chain", () => {
    const draft = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });

    // The agent turn ensures a server challenge for the current candidate state:
    const ensured = ensureVinReviewChallenge(draft, { userId: USER_A });
    assert.ok(ensured.vinChallenge, "server must register a challenge before confirmation");

    const consumed = consumeVinChallenge(
      { challengeId: String(ensured.vinChallenge), userId: USER_A, vin: VALID_A },
      ({ userId, vin, reviewId, challengeId }) =>
        buildConfirmedVinAttributesPatch({ userId, vin, reviewId, challengeId })
    );
    assert.equal(consumed.ok, true);
    assert.equal(consumed.outcome, "confirmed");
    assert.ok(consumed.attrs?.vinConfirmationReceipt, "challenge consumption mints authority");

    const persisted = finalizeCreateVinAuthority(consumed.attrs, USER_A);
    assert.equal(persisted.vin, VALID_A, "the confirmed VIN persists at the final boundary");
    assert.equal(persisted.vinConfirmationReceipt, undefined, "receipts never persist");
  });

  it("REQUIRED 21: local reducer manipulation without a server challenge cannot persist", () => {
    const draft = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });
    const reviewId = String(draft.vinReviewId ?? "");
    const localOnly = applyVinStructuredReviewAction(draft, {
      type: "confirm",
      value: VALID_A,
      reviewId,
    }).attrs;
    // The local result carries draft-state markers but no challenge or receipt:
    assert.equal(localOnly.vinConfirmationReceipt, undefined);
    assert.equal(localOnly.vinChallenge, undefined);
    const persisted = finalizeCreateVinAuthority(localOnly, USER_A);
    assert.equal(persisted.vin, undefined, "a purely local reducer result is never sufficient");
  });

  it("REQUIRED 17: LLM/tool-argument style markers can never create a valid receipt", () => {
    // stripUntrustedVinMarkers removes every receipt/marker key from untrusted maps.
    const toolArgs = {
      vin: VALID_A,
      vinConfirmed: "true",
      vinConfirmedReviewId: "vr_1",
      vinConfirmationReceipt: "deadbeef",
      vinConfirmationIssuedAt: String(Math.floor(Date.now() / 1000)),
      vinConfirmationExpiresAt: String(Math.floor(Date.now() / 1000) + 1000),
    };
    const stripped = stripUntrustedVinMarkers(toolArgs);
    assert.equal(stripped.vin, undefined);
    assert.equal(stripped.vinConfirmationReceipt, undefined);
    const persisted = finalizeCreateVinAuthority(toolArgs, USER_A);
    assert.equal(persisted.vin, undefined);
  });

  it("REQUIRED 18: model-visible projections never contain a receipt or its components", () => {
    const attrs = mintVinConfirmation({ userId: USER_A, vin: VALID_A, reviewId: "vr_1" })!;
    const model = redactVinReviewForModel({
      vin: VALID_A,
      vinConfirmed: "true",
      vinConfirmedReviewId: "vr_1",
      ...attrs,
    });
    assert.equal(model.vin, undefined);
    assert.equal(model.vinConfirmedReviewId, undefined);
    assert.equal(model.vinConfirmationReceipt, undefined);
    assert.equal(model.vinConfirmationIssuedAt, undefined);
    assert.equal(model.vinConfirmationExpiresAt, undefined);
  });

  it("REQUIRED 14/15: stale A authority cannot persist over B (A→B→A newest generation)", () => {
    const draftA = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });
    const ensuredA = ensureVinReviewChallenge(draftA, { userId: USER_A });
    const consumedA = consumeVinChallenge(
      { challengeId: String(ensuredA.vinChallenge), userId: USER_A, vin: VALID_A },
      ({ userId, vin, reviewId, challengeId }) =>
        buildConfirmedVinAttributesPatch({ userId, vin, reviewId, challengeId })
    );
    assert.equal(consumedA.outcome, "confirmed");

    // The draft later moves to B via a fresh correction (new generation) and a
    // NEW server challenge is registered, superseding A's challenge:
    const draftB = applyVinStructuredReviewAction(ensuredA, {
      type: "correct",
      value: VALID_B,
      reviewId: String(ensuredA.vinReviewId),
    }).attrs;
    assert.equal(deriveVinReviewState(draftB).status, "candidate");
    assert.equal(draftB.vinCandidate, VALID_B);
    const ensuredB = ensureVinReviewChallenge(draftB, { userId: USER_A });
    assert.notEqual(ensuredB.vinChallenge, ensuredA.vinChallenge, "B registers a fresh challenge");

    // Replaying A's OLD confirmed state against the B draft must fail closed:
    const forged = {
      ...draftB,
      vin: VALID_A,
      vinConfirmed: "true",
      vinConfirmedReviewId: String(ensuredA.vinReviewId),
      vinChallenge: String(ensuredA.vinChallenge),
      ...(consumedA.attrs ?? {}),
    };
    const persisted = finalizeCreateVinAuthority(forged, USER_A);
    assert.equal(persisted.vin, undefined, "stale A authority must not confirm anything over B");
  });
});
