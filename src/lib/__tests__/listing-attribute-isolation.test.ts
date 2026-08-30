/**
 * Phase 2C + 2D — client category-sanitizer contracts.
 *
 * Phase 2C: `sanitizeAttributesForCategory` must TRANSPORT the exact
 * server-verification envelope (`vinChallenge`, `vinDraftScope`,
 * `vinConfirmedReviewId` + the `VIN_CONFIRMATION_ATTR_KEYS` receipt trio) so
 * the create persistence boundary can verify it. Transport only — these fields
 * never authorize anything client-side.
 *
 * Phase 2D: the sanitizer must also preserve the VIN review DRAFT-STATE markers
 * (10 keys) and the deterministic field-conflict markers (2 keys) for
 * vehicles/transport drafts so a pending review, a human confirmation or an
 * open conflict survives a real client draft round-trip. These 12 keys confer
 * zero authority, never persist, and are never model-visible. `vinReviewState`
 * must remain filtered.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeAttributesForCategory,
} from "@/lib/listing-attribute-isolation";
import type { CategoryAttributes, ListingCategory } from "@/lib/types";

const VALID_VIN = "WBAZZZ8VZM1234567";

const AUTHORITY_ENVELOPE = {
  vin: VALID_VIN,
  vinChallenge: "vc_server_1",
  vinDraftScope: "vs_server_1",
  vinConfirmedReviewId: "vr_server_1",
  vinConfirmationReceipt: "e2e_receipt_1",
  vinConfirmationIssuedAt: "1700000000",
  vinConfirmationExpiresAt: "1700003600",
} as const;

const TRANSPORT_KEYS = [
  "vinChallenge",
  "vinDraftScope",
  "vinConfirmedReviewId",
  "vinConfirmationReceipt",
  "vinConfirmationIssuedAt",
  "vinConfirmationExpiresAt",
] as const;

/** Phase 2D — the 10 VIN review draft-state keys (vehicles/transport only). */
const VIN_DRAFT_STATE = {
  vinCandidate: VALID_VIN,
  vinCandidateSource: "photo_ocr",
  vinCandidateConfidence: "0.9",
  vinConflict: "true",
  vinConflictValue: "VF3XXXXXXXXX99999",
  vinConflictSource: "user_entered",
  vinUncertain: "true",
  vinReviewId: "vr_agent_1",
  vinConfirmed: "true",
  vinConfirmedSource: "user_entered",
} as const;

const VIN_DRAFT_STATE_KEYS = Object.keys(VIN_DRAFT_STATE) as (keyof typeof VIN_DRAFT_STATE)[];

/** Phase 2D — the two deterministic field-conflict draft-state keys. */
const YEAR_CONFLICT_STATE = {
  yearConflict: "true",
  yearConflictCandidate: "2018",
} as const;

function vehicleDraft(extra: CategoryAttributes): CategoryAttributes {
  return {
    make: "BMW",
    model: "320d",
    year: "2015",
    mileage: "180000",
    fuelType: "Dyzelinas",
    ...extra,
  };
}

describe("Phase 2C client — sanitizeAttributesForCategory VIN authority envelope", () => {
  it("preserves the exact six-field server authority transport envelope for a vehicle draft", () => {
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft(AUTHORITY_ENVELOPE)
    );
    assert.equal(out.vin, VALID_VIN, "canonical vin must survive");
    for (const key of TRANSPORT_KEYS) {
      assert.equal(
        out[key],
        AUTHORITY_ENVELOPE[key as keyof typeof AUTHORITY_ENVELOPE],
        `${key} must survive unchanged`
      );
    }
    assert.equal(out.make, "BMW");
    assert.equal(out.model, "320d");
  });

  it("still filters unrelated unknown attributes", () => {
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft({
        totallyUnknownInternalDump: "nope",
        forgedAuthorityField: "fake",
        anotherUnrelated: "x",
      })
    );
    assert.equal(out.totallyUnknownInternalDump, undefined);
    assert.equal(out.forgedAuthorityField, undefined);
    assert.equal(out.anotherUnrelated, undefined);
    assert.equal(out.make, "BMW");
  });

  it("client-only confirmation flags without a receipt synthesize no authority fields", () => {
    // Phase 2D: `vinConfirmed`/`vinConfirmedSource` survive as DRAFT STATE
    // (the review state machine needs them), but no receipt/challenge keys may
    // be synthesized from them and no authority is conferred.
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft({
        vin: VALID_VIN,
        vinConfirmed: "true",
        vinConfirmedSource: "user_entered",
      })
    );
    assert.equal(out.vin, VALID_VIN, "canonical vin survives for the server to judge");
    assert.equal(out.vinConfirmed, "true", "Phase 2D: confirmation flag survives as draft state");
    assert.equal(out.vinConfirmedSource, "user_entered");
    for (const key of TRANSPORT_KEYS) {
      assert.equal(out[key], undefined, `${key} must not be synthesized`);
    }
  });

  it("a forged/invalid envelope is transported verbatim (server remains sole authority)", () => {
    const forged = {
      vin: VALID_VIN,
      vinChallenge: "vc_forged",
      vinDraftScope: "vs_forged",
      vinConfirmedReviewId: "vr_forged",
      vinConfirmationReceipt: "deadbeef",
      vinConfirmationIssuedAt: "1",
      vinConfirmationExpiresAt: "9999999999",
    };
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft(forged)
    );
    for (const key of TRANSPORT_KEYS) {
      assert.equal(out[key], forged[key as keyof typeof forged], `${key} must pass through for verification`);
    }
    assert.equal(out.vin, VALID_VIN);
  });
});

describe("Phase 2D client — draft-state round-trip preservation", () => {
  it("preserves all 10 VIN review draft-state values unchanged for a vehicle draft", () => {
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft(VIN_DRAFT_STATE)
    );
    for (const key of VIN_DRAFT_STATE_KEYS) {
      assert.equal(out[key], VIN_DRAFT_STATE[key], `${key} must survive unchanged`);
    }
  });

  it("preserves both year-conflict values unchanged for a vehicle draft", () => {
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft(YEAR_CONFLICT_STATE)
    );
    assert.equal(out.yearConflict, "true");
    assert.equal(out.yearConflictCandidate, "2018");
  });

  it("preserves the existing six authority transport values unchanged alongside the 12 draft-state keys", () => {
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft({ ...AUTHORITY_ENVELOPE, ...VIN_DRAFT_STATE, ...YEAR_CONFLICT_STATE })
    );
    for (const key of TRANSPORT_KEYS) {
      assert.equal(
        out[key],
        AUTHORITY_ENVELOPE[key as keyof typeof AUTHORITY_ENVELOPE],
        `${key} must survive unchanged`
      );
    }
    for (const key of VIN_DRAFT_STATE_KEYS) {
      assert.equal(out[key], VIN_DRAFT_STATE[key]);
    }
    assert.equal(out.yearConflict, "true");
    assert.equal(out.yearConflictCandidate, "2018");
  });

  it("vinReviewState is filtered (never preserved through the sanitizer)", () => {
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft({ vinReviewState: "pending_human_review" })
    );
    assert.equal(out.vinReviewState, undefined);
  });

  it("unrelated unknown attributes remain filtered even with draft-state keys present", () => {
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft({ ...VIN_DRAFT_STATE, ...YEAR_CONFLICT_STATE, randomJunkKey: "x" })
    );
    assert.equal(out.randomJunkKey, undefined);
  });

  it("safe schema attributes remain intact", () => {
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft({ ...VIN_DRAFT_STATE, ...YEAR_CONFLICT_STATE })
    );
    assert.equal(out.make, "BMW");
    assert.equal(out.model, "320d");
    assert.equal(out.year, "2015");
    assert.equal(out.mileage, "180000");
    assert.equal(out.fuelType, "Dyzelinas");
  });

  it("draft-state keys are NOT preserved for non-vehicle categories", () => {
    const out = sanitizeAttributesForCategory(
      "clothing" as ListingCategory,
      {},
      { clothingType: "Jacket", condition: "Nauja", ...VIN_DRAFT_STATE, ...YEAR_CONFLICT_STATE }
    );
    for (const key of VIN_DRAFT_STATE_KEYS) {
      assert.equal(out[key], undefined, `${key} must not survive on clothing drafts`);
    }
    assert.equal(out.yearConflict, undefined);
    assert.equal(out.yearConflictCandidate, undefined);
    assert.equal(out.clothingType, "Jacket");
  });
});
