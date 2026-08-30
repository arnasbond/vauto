/**
 * Phase 2C — VIN resolution inside the Phase 2B single-highest-value-question
 * policy (REQUIRED 29).
 *
 * An unconfirmed VIN candidate surfaces through the UNCERTAIN tier (present but
 * untrusted value); a conflict surfaces through the CONFLICT tier; once the
 * human confirms, the field resolves and the policy advances to the next
 * highest-value question without looping on VIN.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  factsFromAttributes,
  selectNextQuestion,
} from "../next-question-policy.js";
import {
  applyVinExtractionCandidate,
  confirmVin,
} from "../../../vehicle/vin-review.js";

const VALID_A = "WBAZZZ8VZM1234567";
const VALID_B = "VF3XXXXXXXXX99999";

function vehicleAttrs(extra: Record<string, string> = {}): Record<string, string> {
  return {
    make: "BMW",
    model: "320d",
    year: "2015",
    mileage: "150000",
    fuelType: "Dyzelinas",
    transmission: "Automatinė",
    techInspection: "2025-01",
    sellerType: "private",
    ...extra,
  };
}

function nextQuestionFor(attrs: Record<string, string>): ReturnType<typeof selectNextQuestion> {
  const facts = factsFromAttributes("vehicles", attrs, { price: 9000 });
  return selectNextQuestion({
    category: "vehicles",
    facts,
    blockers: {
      sellerType: { value: String(attrs.sellerType ?? "") },
      city: { value: "Vilnius" },
    },
  });
}

describe("Phase 2C — VIN inside the Phase 2B question policy", () => {
  it("a pending VIN candidate is never treated as a confirmed present field", () => {
    const facts = factsFromAttributes("vehicles", vehicleAttrs());
    assert.equal(facts.vin?.value, undefined, "no VIN yet → absent");

    const withCandidate = {
      ...vehicleAttrs(),
      ...applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" }),
    };
    const facts2 = factsFromAttributes("vehicles", withCandidate);
    assert.equal(facts2.vin?.value, VALID_A, "candidate surfaces as a present-but-untrusted value");
    assert.ok((facts2.vin?.confidence ?? 1) < 1, "unconfirmed candidate must be marked uncertain");
  });

  it("VIN uncertainty can become the next highest-value question", () => {
    const attrs = {
      ...vehicleAttrs(),
      ...applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" }),
    };
    const next = nextQuestionFor(attrs);
    assert.ok(next, "the policy must ask about the uncertain VIN");
    assert.equal(next!.field, "vin");
    assert.equal(next!.reason, "uncertain");
    assert.match(next!.question, /VIN/i);
  });

  it("a VIN conflict outranks ordinary questions and asks the conflict phrasing", () => {
    const a = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });
    const conflicted = applyVinExtractionCandidate(a, { value: VALID_B, source: "document_ocr" });
    const next = nextQuestionFor({ ...vehicleAttrs(), ...conflicted });
    assert.ok(next);
    assert.equal(next!.field, "vin");
    assert.equal(next!.reason, "conflict");
    assert.match(next!.question, /skirtingi/i);
  });

  it("resolving the VIN advances the conversation naturally — no question loop", () => {
    const candidate = applyVinExtractionCandidate({}, { value: VALID_A, source: "photo_ocr" });
    const confirmed = confirmVin(candidate, {
      type: "confirm",
      value: VALID_A,
      reviewId: candidate.vinReviewId ?? "",
    }).attrs;
    const resolvedAttrs = { ...vehicleAttrs(), ...confirmed };

    // After confirmation the VIN is present, certain and non-conflicting:
    const facts = factsFromAttributes("vehicles", resolvedAttrs);
    assert.equal(facts.vin?.value, VALID_A);
    assert.equal(facts.vin?.confidence, 1);
    assert.equal(facts.vin?.conflict, false);

    // The policy moves to the next missing/uncertain fact, NOT back to VIN:
    const next = nextQuestionFor(resolvedAttrs);
    assert.ok(!next || next.field !== "vin", "VIN must not loop after resolution");

    // And with every other fact satisfied the policy offers no further question:
    const complete = {
      ...resolvedAttrs,
      year: "2015",
      mileage: "150000",
      techInspection: "2025-01",
      transmission: "Automatinė",
      fuelType: "Dyzelinas",
    };
    const exhausted = nextQuestionFor(complete);
    assert.equal(exhausted, null, "fully resolved draft → no next question");
  });
});
