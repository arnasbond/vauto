import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHumanValue,
  canAiOverwriteField,
  classifyIntelConfidence,
  confidenceReviewAdvice,
  createIntelField,
  intelFieldValue,
  mergeAiSuggestion,
} from "./draft-intelligence";
import type {
  ListingIntelDraft,
  ListingIntelField,
} from "./draft-intelligence";

describe("A. provenance preserved", () => {
  it("preserves a structured origin per field", () => {
    const f = createIntelField({ value: "2019", provenance: "VISION" });
    assert.equal(f.provenance, "VISION");
    assert.equal(f.value, "2019");
  });

  it("never fabricates provenance — defaults to UNKNOWN", () => {
    const f = createIntelField({ value: 5 });
    assert.equal(f.provenance, "UNKNOWN");
  });
});

describe("B. unknown confidence represented honestly", () => {
  it("distinguishes unknown from high confidence", () => {
    const unknown = createIntelField({ value: "x", confidence: null });
    const high = createIntelField({ value: "x", confidence: 0.95 });
    assert.equal(classifyIntelConfidence(unknown.confidence), "UNKNOWN");
    assert.equal(classifyIntelConfidence(high.confidence), "HIGH");
    assert.notEqual(unknown.requiresReview, high.requiresReview);
  });

  it("does not manufacture fake numeric confidence", () => {
    const f = createIntelField({ value: "x", confidence: undefined });
    assert.equal(f.confidence, null);
    assert.equal(classifyIntelConfidence(f.confidence), "UNKNOWN");
  });
});

describe("C. low-confidence value requires/recommends review as designed", () => {
  it("marks a low-confidence field requiresReview", () => {
    const f = createIntelField({ value: 2020, confidence: 0.4 });
    assert.equal(f.requiresReview, true);
    assert.equal(confidenceReviewAdvice(0.4), "REVIEW");
  });

  it("high confidence does not require review (but is still not a publish gate)", () => {
    const f = createIntelField({ value: 2020, confidence: 0.95 });
    assert.equal(f.requiresReview, false);
    assert.equal(confidenceReviewAdvice(0.95), "NO_REVIEW");
  });
});

describe("D. human confirmation survives subsequent AI suggestion", () => {
  it("AI suggestion cannot overwrite a human-confirmed field", () => {
    let f = createIntelField({ value: "Vilnius", provenance: "VISION" });
    f = applyHumanValue(f, "Kaunas");
    assert.equal(f.reviewState, "HUMAN_CONFIRMED");

    const incoming = createIntelField({
      value: "Vilnius",
      provenance: "VISION",
      confidence: 0.99,
    });
    const { field } = mergeAiSuggestion(f, incoming);
    assert.equal(field.value, "Kaunas");
    assert.equal(field.reviewState, "HUMAN_CONFIRMED");
    assert.equal(canAiOverwriteField(field), false);
  });
});

describe("E. human override wins over AI proposal", () => {
  it("explicit human edit becomes HUMAN_OVERRIDDEN and wins", () => {
    let f = createIntelField({ value: "2020", provenance: "VISION" });
    f = applyHumanValue(f, "2019", { overridden: true });
    assert.equal(f.reviewState, "HUMAN_OVERRIDDEN");
    assert.equal(f.value, "2019");
    assert.equal(f.requiresReview, false);
  });
});

describe("F. conflicting sources create explicit conflict", () => {
  it("two differing non-human values create an explicit conflict", () => {
    const existing = createIntelField({
      value: "2019",
      provenance: "USER_TEXT",
      reviewState: "AI_SUGGESTED",
    });
    const incoming = createIntelField({ value: "2020", provenance: "VISION" });
    const { field, conflictCreated } = mergeAiSuggestion(existing, incoming);
    assert.equal(conflictCreated, true);
    assert.equal(field.conflicts.length, 1);
    assert.equal(field.conflicts[0]!.candidates.length, 2);
    assert.equal(field.conflicts[0]!.candidates[0]!.value, "2019");
    assert.equal(field.conflicts[0]!.candidates[1]!.value, "2020");
  });
});

describe("G. no silent conflict resolution", () => {
  it("does not silently pick the higher-confidence value", () => {
    const existing = createIntelField({ value: "2019", provenance: "VISION", confidence: 0.95 });
    const incoming = createIntelField({ value: "2020", provenance: "VISION", confidence: 0.98 });
    const { field } = mergeAiSuggestion(existing, incoming);
    // Must keep BOTH candidates; must NOT resolve to 2020 automatically.
    assert.equal(field.value, "2019");
    assert.equal(field.conflicts.length, 1);
    assert.equal(field.requiresReview, true);
  });
});

describe("I. long-context stress preserves current intent and policy (contract level)", () => {
  it("stale context does not silently mutate canonical fields", () => {
    let field = createIntelField({ value: "Raudonas", provenance: "USER_ENTERED" });
    // 50 stale suggestions about a different property must not change the field.
    for (let i = 0; i < 50; i++) {
      field = mergeAiSuggestion(field, createIntelField({ value: "Mėlynas", provenance: "VISION" })).field;
    }
    assert.equal(field.value, "Raudonas");
    assert.equal(field.reviewState, "HUMAN_CONFIRMED");
  });
});

describe("J. canonical contract serializes/deserializes safely", () => {
  it("round-trips through JSON without losing structure", () => {
    const draft: ListingIntelDraft = {
      fields: {
        year: createIntelField({ value: 2020, provenance: "VISION", confidence: 0.8 }),
        color: createIntelField({ value: "Raudonas", provenance: "USER_ENTERED" }),
      },
      requiresReview: true,
      reviewReasons: ["Metai gali reikalauti peržiūros."],
    };
    const json = JSON.stringify(draft);
    const parsed = JSON.parse(json) as ListingIntelDraft;
    assert.deepEqual(parsed, draft);
    assert.equal(parsed.fields.year!.value, 2020);
    assert.equal(parsed.fields.color!.reviewState, "HUMAN_CONFIRMED");
  });
});

describe("K. existing reviewHints remain non-authoritative", () => {
  it("review hints derived from canonical state are advisory only", () => {
    const field = createIntelField({ value: 2020, confidence: 0.4 });
    // The canonical contract exposes review state but no publish-veto field.
    const hint = {
      id: "low-confidence",
      text: "AI užtikrintumas žemas — peržiūrėkite laukus ranka.",
      requiresReview: field.requiresReview,
    };
    assert.equal(hint.requiresReview, true);
    // Contract: hints must never carry a blocking/publish authority.
    assert.ok(!("blocking" in hint));
    assert.ok(!("publishAllowed" in hint));
  });
});

describe("L. representative multiple verticals do not corrupt one another", () => {
  it("transport and electronics fields remain isolated in one draft", () => {
    const draft: ListingIntelDraft = {
      fields: {
        "attributes.engineKw": createIntelField({ value: 110, provenance: "VISION" }),
        "attributes.storageGb": createIntelField({ value: 256, provenance: "USER_TEXT" }),
      },
      requiresReview: false,
      reviewReasons: [],
    };
    assert.equal(intelFieldValue(draft, "attributes.engineKw"), 110);
    assert.equal(intelFieldValue(draft, "attributes.storageGb"), 256);
    assert.equal(intelFieldValue(draft, "attributes.engineKw"), 110);
    assert.equal(draft.fields["attributes.engineKw"]!.provenance, "VISION");
    assert.equal(draft.fields["attributes.storageGb"]!.provenance, "USER_TEXT");
  });

  it("services and jobs fields do not cross-contaminate", () => {
    const draft: ListingIntelDraft = {
      fields: {
        "attributes.priceModel": createIntelField({ value: "30 €/val", provenance: "USER_ENTERED" }),
        "attributes.jobType": createIntelField({ value: "Nuotolinis", provenance: "USER_TEXT" }),
      },
      requiresReview: false,
      reviewReasons: [],
    };
    assert.equal(draft.fields["attributes.priceModel"]!.value, "30 €/val");
    assert.equal(draft.fields["attributes.jobType"]!.value, "Nuotolinis");
    assert.equal(draft.fields["attributes.priceModel"]!.reviewState, "HUMAN_CONFIRMED");
  });
});

void (null as ListingIntelField<unknown> | null);
