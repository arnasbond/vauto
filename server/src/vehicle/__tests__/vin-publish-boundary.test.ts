import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeListingAttributesForPersistence } from "../../shared/listing-attributes-sanitize.js";
import { validateListing } from "../../validation.js";
import {
  applyVinExtractionCandidate,
  applyVinManualEntryCandidate,
  confirmVin,
} from "../vin-review.js";
import {
  consumeVinChallenge,
  registerVinChallenge,
  resetVinChallengeBoundaryForTests,
  type VinChallengeRecord,
} from "../vin-challenge.js";
import {
  buildConfirmedVinAttributesPatch,
  finalizeCreateVinAuthority,
  finalizePatchVinAuthority,
  __vinConfirmationTestSecrets,
} from "../vin-confirmation.js";
import { mintVinDraftScope } from "../vin-challenge.js";

/**
 * Phase 2C Round 4 — publish-boundary tests (server-registered challenge +
 * server-owned receipt authority).
 *
 * The shared sanitizer is SHAPE-ONLY (normalize + strip markers, keep the VIN +
 * verification metadata); the SERVER decides persistence via
 * `finalizeCreateVinAuthority` (POST) and `finalizePatchVinAuthority` (PATCH)
 * using the original persisted DB VIN or a valid challenge-bound confirmation
 * receipt.
 */

const VALID_A = "WVWZZZ1KZAW123456";
const VALID_B = "1HGCM82633A004352";
const USER = "seller-1";

function baseListingBody(attributes: Record<string, string>) {
  return {
    id: "l-vin-publish-1",
    title: "BMW 320d",
    price: 5000,
    location: "Vilnius",
    distanceKm: 0,
    image: "https://example.com/cover.jpg",
    category: "vehicles",
    tags: [],
    sellerId: USER,
    createdAt: new Date().toISOString(),
    attributes,
  };
}

function candidateAttrs(value: string = VALID_A): Record<string, string> {
  return applyVinExtractionCandidate({}, { value, source: "photo_ocr", confidence: 0.97 });
}

function confirmedAttrs(value: string = VALID_A): Record<string, string> {
  const attrs = candidateAttrs(value);
  return confirmVin(attrs, {
    type: "confirm",
    value,
    reviewId: attrs.vinReviewId ?? "",
  }).attrs;
}

/** Full server flow: register challenge → consume → server authority patch. */
function receiptAttrs(
  value: string = VALID_A,
  userId: string = USER,
  listingId?: string,
  draftScope?: string
): Record<string, string> {
  const registered = registerVinChallenge({
    userId,
    values: [value],
    listingId,
    draftScope: draftScope ?? (listingId ? undefined : mintTestScope(userId)),
  });
  assert.ok(registered && registered.outcome === "registered", "registration must succeed");
  const consumed = consumeVinChallenge(
    { challengeId: registered.challenge.challengeId, userId, vin: value, listingId },
    ({ userId: u, vin: v, reviewId: r, listingId: l, draftScope: s, challengeId: c }) =>
      buildConfirmedVinAttributesPatch({
        userId: u,
        vin: v,
        reviewId: r,
        listingId: l,
        draftScope: s,
        challengeId: c,
      })
  );
  assert.equal(consumed.ok, true);
  return consumed.attrs ?? {};
}

function mintTestScope(userId: string): string {
  const scope = mintVinDraftScope(userId);
  assert.ok(scope, "scope mint must succeed");
  return scope.draftScope;
}

describe("Phase 2C R3 — shared sanitizer is shape-only (never authority)", () => {
  test("normalizes a plausible VIN, strips draft-state markers, and lets verification metadata through", () => {
    const attrs = receiptAttrs();
    const out = sanitizeListingAttributesForPersistence({
      ...attrs,
      vinCandidate: VALID_B,
      vinReviewId: "vr_x",
    });
    assert.equal(out.vin, VALID_A, "shape sanitizer must not decide VIN authority");
    assert.equal(out.vinCandidate, undefined);
    assert.equal(out.vinConfirmed, undefined);
    assert.equal(out.vinReviewId, undefined);
    assert.equal(out.vinReviewState, undefined);
    // Verification metadata must survive to reach the server boundary:
    assert.ok(out.vinConfirmedReviewId, "receipt-bound review id must pass through");
    assert.ok(out.vinChallenge, "challenge id must pass through for server verification");
    assert.ok(out.vinConfirmationReceipt, "receipt must pass through for server verification");
    assert.ok(out.vinConfirmationIssuedAt);
    assert.ok(out.vinConfirmationExpiresAt);
  });

  test("the server finalizer strips receipts, challenge ids and every authority marker from persisted output", () => {
    const attrs = receiptAttrs();
    const out = finalizeCreateVinAuthority(attrs, USER);
    assert.equal(out.vin, VALID_A);
    assert.equal(out.vinConfirmationReceipt, undefined, "receipts never persist");
    assert.equal(out.vinConfirmationIssuedAt, undefined);
    assert.equal(out.vinConfirmationExpiresAt, undefined);
    assert.equal(out.vinConfirmed, undefined);
    assert.equal(out.vinConfirmedReviewId, undefined);
    assert.equal(out.vinChallenge, undefined, "challenge ids never persist");
  });

  test("drops implausible VIN shapes", () => {
    const out = sanitizeListingAttributesForPersistence({ vin: "NOTAVIN" });
    assert.equal(out.vin, undefined);
  });

  test("full validateListing round-trip keeps shape but the authority step happens server-side", () => {
    const result = validateListing(baseListingBody(receiptAttrs()));
    assert.equal(result.ok, true);
    if (result.ok) {
      // validateListing performs only the shape sanitize (vin retained for the
      // authority step); the route then applies finalizeCreateVinAuthority.
      assert.equal(result.value.attributes?.vin, VALID_A);
      assert.equal(result.value.attributes?.vinCandidate, undefined);
      assert.equal(result.value.attributes?.vinConfirmed, undefined);
    }
  });
});

describe("Phase 2C R3 — POST create authority (finalizeCreateVinAuthority)", () => {
  test("REQUIRED 1/2: plausible VIN + forged vinConfirmed=true + arbitrary review id does NOT persist", () => {
    const forged = {
      vin: VALID_A,
      vinConfirmed: "true",
      vinConfirmedSource: "user_entered",
      vinConfirmedReviewId: "vr_whatever",
    };
    const out = finalizeCreateVinAuthority(forged, USER);
    assert.equal(out.vin, undefined);
  });

  test("REQUIRED 1/2: every forged VIN marker combination does not persist", () => {
    const forged = {
      vin: VALID_A,
      vinConfirmed: "true",
      vinConfirmedSource: "existing_confirmed",
      vinConfirmedReviewId: "persisted_listing",
      vinConfirmationReceipt: "a".repeat(64),
      vinConfirmationIssuedAt: String(Math.floor(Date.now() / 1000)),
      vinConfirmationExpiresAt: String(Math.floor(Date.now() / 1000) + 1000),
    };
    const out = finalizeCreateVinAuthority(forged, USER);
    assert.equal(out.vin, undefined);
  });

  test("pending candidate/conflict state is omitted even with a forged receipt", () => {
    // A draft in pending-candidate state with a (stale/forged) receipt attached:
    const forged = {
      ...receiptAttrs(),
      vin: "",
      vinCandidate: VALID_A,
      vinUncertain: "true",
      vinReviewId: "vr_new_pending",
    };
    const out = finalizeCreateVinAuthority(forged, USER);
    assert.equal(out.vin, undefined);
  });

  test("REQUIRED 7: a valid server-minted receipt persists the VIN exactly once, markers stripped", () => {
    const attrs = receiptAttrs();
    const out = finalizeCreateVinAuthority(attrs, USER);
    assert.equal(out.vin, VALID_A);
    assert.equal(out.vinConfirmed, undefined);
    assert.equal(out.vinConfirmationReceipt, undefined);
  });

  test("receipt for another user fails (cross-user)", () => {
    const attrs = receiptAttrs(VALID_A, "other-user");
    const out = finalizeCreateVinAuthority(attrs, USER);
    assert.equal(out.vin, undefined);
  });

  test("receipt for another VIN fails", () => {
    const attrs = receiptAttrs(VALID_B);
    const tampered = { ...attrs, vin: VALID_A };
    const out = finalizeCreateVinAuthority(tampered, USER);
    assert.equal(out.vin, undefined);
  });

  test("receipt for another reviewId fails", () => {
    const attrs = receiptAttrs();
    const tampered = { ...attrs, vinConfirmedReviewId: "vr_other" };
    const out = finalizeCreateVinAuthority(tampered, USER);
    assert.equal(out.vin, undefined);
  });

  test("expired receipt fails", () => {
    const attrs = candidateAttrs();
    const registered = registerVinChallenge({
      userId: USER,
      values: [VALID_A],
      draftScope: mintTestScope(USER),
      nowMs: Date.now() - 25 * 60 * 60 * 1000,
      ttlOverrideMs: 60 * 1000,
    });
    assert.ok(registered && registered.outcome === "registered");
    const consumed = consumeVinChallenge(
      { challengeId: registered.challenge.challengeId, userId: USER, vin: VALID_A },
      ({ userId: u, vin: v, reviewId: r, draftScope: s, challengeId: c }) =>
        buildConfirmedVinAttributesPatch({ userId: u, vin: v, reviewId: r, draftScope: s, challengeId: c })
    );
    // The challenge itself is expired — consumption fails; even a forged patch
    // with the receipt fields cannot persist.
    assert.equal(consumed.ok, false);
    assert.equal(consumed.outcome, "challenge_expired");
    const forgedPatch = {
      vin: VALID_A,
      vinConfirmed: "true",
      vinConfirmedReviewId: registered.challenge.reviewId,
      vinChallenge: registered.challenge.challengeId,
      vinConfirmationReceipt: "f".repeat(64),
      vinConfirmationIssuedAt: String(Math.floor(Date.now() / 1000)),
      vinConfirmationExpiresAt: String(Math.floor(Date.now() / 1000) + 1000),
    };
    const out = finalizeCreateVinAuthority(forgedPatch, USER);
    assert.equal(out.vin, undefined);
  });

  test("tampered receipt fails (flipped hex nibble)", () => {
    const attrs = receiptAttrs();
    const receipt = attrs.vinConfirmationReceipt ?? "";
    const flipped =
      receipt.slice(0, receipt.length - 1) +
      (receipt.endsWith("0") ? "1" : "0");
    const out = finalizeCreateVinAuthority(
      { ...attrs, vinConfirmationReceipt: flipped },
      USER
    );
    assert.equal(out.vin, undefined);
  });

  test("legacy-unconfirmed VIN (no receipt) is omitted", () => {
    const out = finalizeCreateVinAuthority({ vin: VALID_A }, USER);
    assert.equal(out.vin, undefined);
  });
});

describe("Phase 2C R3 — PATCH authority (finalizePatchVinAuthority)", () => {
  const LISTING_ID = "l-persisted-1";

  function patchOutcome(
    attrs: Record<string, string>,
    existingVin: string | string[] | undefined
  ): Record<string, string | string[] | undefined> {
    // Mirrors the real route: the RAW merged DB+patch attrs feed the finalizer,
    // which performs shape sanitization internally after reading pending
    // candidate/conflict markers.
    return finalizePatchVinAuthority(attrs, {
      userId: USER,
      listingId: LISTING_ID,
      existingVin,
    });
  }

  test("REQUIRED 5: unchanged original DB VIN is preserved without any receipt", () => {
    const out = patchOutcome({ vin: VALID_A, mileage: "150000" }, VALID_A);
    assert.equal(out.vin, VALID_A);
  });

  test("REQUIRED 3: replacement VIN without trusted confirmation cannot inherit existing_confirmed", () => {
    const out = patchOutcome({ vin: VALID_B }, VALID_A);
    assert.equal(out.vin, undefined);
  });

  test("REQUIRED 4: replacement VIN + forged confirmation markers cannot persist it", () => {
    const out = patchOutcome(
      {
        vin: VALID_B,
        vinConfirmed: "true",
        vinConfirmedSource: "existing_confirmed",
        vinConfirmedReviewId: "persisted_listing",
      },
      VALID_A
    );
    assert.equal(out.vin, undefined);
  });

  test("REQUIRED 6: editing a persisted VIN converts it into an unconfirmed candidate (omitted at persist)", () => {
    const edited = applyVinManualEntryCandidate(
      { vin: VALID_A },
      VALID_B,
      "user_entered"
    );
    const out = patchOutcome(edited, VALID_A);
    assert.equal(out.vin, undefined);
  });

  test("REQUIRED 7: a valid listing-bound confirmation persists the replacement VIN", () => {
    const full = receiptAttrs(VALID_B, USER, LISTING_ID);
    const out = patchOutcome(full, VALID_A);
    assert.equal(out.vin, VALID_B);
  });

  test("REQUIRED 9: confirmation minted for another listing fails", () => {
    const full = receiptAttrs(VALID_B, USER, "l-other-listing");
    const out = patchOutcome(full, VALID_A);
    assert.equal(out.vin, undefined);
  });

  test("REQUIRED 8: confirmation minted for another user fails on PATCH", () => {
    const full = receiptAttrs(VALID_B, "other-user", LISTING_ID);
    const out = patchOutcome(full, VALID_A);
    assert.equal(out.vin, undefined);
  });

  test("REQUIRED 14/15: stale A challenge cannot confirm B (A→B→A requires the newest generation)", () => {
    const attrsA = candidateAttrs(VALID_A);
    const registeredA = registerVinChallenge({
      userId: USER,
      values: [VALID_A],
      listingId: LISTING_ID,
    });
    assert.ok(registeredA && registeredA.outcome === "registered");
    const consumedA = consumeVinChallenge(
      { challengeId: registeredA.challenge.challengeId, userId: USER, vin: VALID_A, listingId: LISTING_ID },
      ({ userId: u, vin: v, reviewId: r, listingId: l, challengeId: c }) =>
        buildConfirmedVinAttributesPatch({ userId: u, vin: v, reviewId: r, listingId: l, challengeId: c })
    );
    assert.equal(consumedA.outcome, "confirmed");

    // The draft moved on to B (fresh generation) — a new challenge supersedes A's
    // AUTOMATICALLY (same userId+listingId, no client hints):
    const registeredB = registerVinChallenge({
      userId: USER,
      values: [VALID_B],
      listingId: LISTING_ID,
    });
    assert.ok(registeredB && registeredB.outcome === "registered");
    assert.notEqual(registeredB.challenge.challengeId, registeredA.challenge.challengeId);

    // Replaying A's confirmed authority over a listing that moved to B must
    // fail closed (the superseded challenge cannot authorize A anymore):
    const out = patchOutcome(
      {
        vin: VALID_A,
        vinConfirmed: "true",
        vinConfirmedReviewId: registeredA.challenge.reviewId,
        vinChallenge: registeredA.challenge.challengeId,
        ...(consumedA.attrs ?? {}),
      },
      VALID_B
    );
    assert.equal(out.vin, undefined, "superseded A authority must not persist anything");
  });

  test("REQUIRED 16: safe retry/replay is idempotent — the same challenge-bound confirmation verifies repeatedly", () => {
    const full = receiptAttrs(VALID_B, USER, LISTING_ID);
    const first = patchOutcome(full, VALID_A);
    const second = patchOutcome(full, VALID_A);
    assert.equal(first.vin, VALID_B);
    assert.equal(second.vin, VALID_B);
  });

  test("cleared VIN on a persisted listing removes it (no authority, no resurrection)", () => {
    const out = patchOutcome({ vin: "", mileage: "200000" }, VALID_A);
    assert.equal(out.vin, undefined);
    assert.equal(out.mileage, "200000");
  });
});
