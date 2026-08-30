/**
 * Phase 2C — client category-sanitizer contract for the VIN authority envelope.
 *
 * `sanitizeAttributesForCategory` must TRANSPORT the exact server-verification
 * fields (`vinChallenge`, `vinDraftScope`, `vinConfirmedReviewId` + the
 * `VIN_CONFIRMATION_ATTR_KEYS` receipt trio) through the draft pipeline so the
 * create persistence boundary can verify them. Transport only — these fields
 * never authorize anything client-side, and unrelated unknown attributes must
 * keep being filtered out.
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

  it("client-only confirmation flags without a receipt confer no authority fields", () => {
    // `vinConfirmed`/`vinConfirmedSource` are UI labels, not authority: they
    // must not survive the sanitizer, and no receipt/challenge keys may be
    // synthesized from them.
    const out = sanitizeAttributesForCategory(
      "vehicles" as ListingCategory,
      {},
      vehicleDraft({
        vin: VALID_VIN,
        vinConfirmed: "true",
        vinConfirmedSource: "user_entered",
      })
    );
    assert.equal(out.vin, VALID_VIN, "shape-only vin survives for the server to judge");
    assert.equal(out.vinConfirmed, undefined);
    assert.equal(out.vinConfirmedSource, undefined);
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
    // No client-side promotion of the canonical vin beyond the shape sanitizer:
    assert.equal(out.vin, VALID_VIN);
  });
});
