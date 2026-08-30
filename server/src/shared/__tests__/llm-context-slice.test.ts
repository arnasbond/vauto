/**
 * Phase 2C — server-owned LLM boundary redaction contract.
 *
 * `slimListingDraftForLlm` is the single slice that carries a client-supplied
 * listing draft into the model-visible `[Vedlio kontekstas]` block. No VIN
 * value, challenge, draft scope, review generation, confirmation receipt,
 * receipt timestamp, candidate/conflict marker or review-state flag may pass
 * this boundary — even when a (possibly compromised) client sends them.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slimListingDraftForLlm } from "../llm-context-slice.js";
import {
  UNTRUSTED_VIN_MARKER_KEYS,
  VIN_REVIEW_MODEL_STATE_KEY,
} from "../vin-review.js";

const VIN_HIDDEN_KEYS = new Set<string>([
  ...UNTRUSTED_VIN_MARKER_KEYS,
  VIN_REVIEW_MODEL_STATE_KEY,
]);

function draftWithInjectedEnvelope() {
  return {
    title: "BMW 320d",
    description: "Tvarkingas automobilis",
    price: 9000,
    location: "Vilnius",
    category: "vehicles",
    listingFlowState: "AWAITING_CONFIRMATION",
    allowPastomatas: true,
    orderedImageUrls: ["https://cdn.example.com/cover.jpg"],
    attributes: {
      make: "BMW",
      model: "320d",
      year: "2015",
      mileage: "180000",
      fuelType: "Dyzelinas",
      // Deliberately injected authority envelope — must never reach the LLM:
      vin: "WBAZZZ8VZM1234567",
      vinCandidate: "WBAZZZ8VZM1234567",
      vinCandidateSource: "photo_ocr",
      vinCandidateConfidence: "0.9",
      vinConflictValue: "VF3XXXXXXXXX99999",
      vinConflictSource: "user_entered",
      vinConflict: "true",
      vinUncertain: "true",
      vinReviewId: "vr_agent_1",
      vinConfirmed: "true",
      vinConfirmedSource: "user_entered",
      vinConfirmedReviewId: "vr_agent_1",
      vinChallenge: "vc_agent_1",
      vinDraftScope: "vs_agent_1",
      vinConfirmationReceipt: "deadbeefreceipt",
      vinConfirmationIssuedAt: "1700000000",
      vinConfirmationExpiresAt: "1700003600",
      vinReviewState: "pending_human_review",
    },
  };
}

describe("Phase 2C — slimListingDraftForLlm VIN authority redaction", () => {
  it("removes every UNTRUSTED_VIN_MARKER_KEYS member and vinReviewState", () => {
    const slim = slimListingDraftForLlm(draftWithInjectedEnvelope());
    assert.ok(slim, "slice must be produced");
    const attrs = slim.attributes as Record<string, string>;
    for (const key of VIN_HIDDEN_KEYS) {
      assert.equal(
        attrs[key],
        undefined,
        `model-visible attributes must never contain ${key}`
      );
    }
  });

  it("does not mutate the input draft", () => {
    const input = draftWithInjectedEnvelope();
    const snapshot = JSON.parse(JSON.stringify(input));
    slimListingDraftForLlm(input);
    assert.deepEqual(input, snapshot, "input draft must remain unchanged");
    assert.equal(
      input.attributes.vinConfirmationReceipt,
      "deadbeefreceipt",
      "input still carries the injected envelope (redaction is copy-only)"
    );
  });

  it("keeps safe ordinary listing attributes model-visible", () => {
    const slim = slimListingDraftForLlm(draftWithInjectedEnvelope());
    const attrs = slim!.attributes as Record<string, string>;
    assert.equal(attrs.make, "BMW");
    assert.equal(attrs.model, "320d");
    assert.equal(attrs.year, "2015");
    assert.equal(attrs.mileage, "180000");
    assert.equal(attrs.fuelType, "Dyzelinas");
    assert.equal(slim!.title, "BMW 320d");
    assert.equal(slim!.price, 9000);
    assert.equal(slim!.category, "vehicles");
  });

  it("a deliberately injected receipt/challenge/scope/review envelope is absent from the LLM context", () => {
    const slim = slimListingDraftForLlm(draftWithInjectedEnvelope());
    const serialized = JSON.stringify(slim);
    for (const token of [
      "deadbeefreceipt",
      "vc_agent_1",
      "vs_agent_1",
      "vr_agent_1",
      "WBAZZZ8VZM1234567",
    ]) {
      assert.ok(
        !serialized.includes(token),
        `authority token ${token} must not appear anywhere in the LLM context`
      );
    }
    assert.ok(
      !serialized.includes("pending_human_review"),
      "review-state flag must not appear in the LLM context"
    );
  });
});
