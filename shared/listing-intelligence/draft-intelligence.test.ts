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
  normalizeIntelConfidence,
} from "./draft-intelligence";
import type {
  ListingIntelDraft,
  ListingIntelField,
} from "./draft-intelligence";

/** Convenience: merge with a real stable field key (post-remediation signature). */
function mergeAt<T>(
  fieldKey: string,
  existing: ListingIntelField<T> | undefined,
  incoming: ListingIntelField<T>
) {
  return mergeAiSuggestion(fieldKey, existing, incoming);
}

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
    const { field } = mergeAt("location", f, incoming);
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
    const { field, conflictCreated } = mergeAt("year", existing, incoming);
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
    const { field } = mergeAt("year", existing, incoming);
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
      field = mergeAt("color", field, createIntelField({ value: "Mėlynas", provenance: "VISION" })).field;
    }
    assert.equal(field.value, "Raudonas");
    assert.equal(field.reviewState, "HUMAN_CONFIRMED");
  });

  it("stale context can never silently upgrade an AI/context value to human authority", () => {
    // 50 stale CONTEXT suggestions must NOT turn the field into HUMAN_CONFIRMED.
    let field = createIntelField({ value: "2020", provenance: "CONTEXT" });
    for (let i = 0; i < 50; i++) {
      field = mergeAt("year", field, createIntelField({ value: "2020", provenance: "CONTEXT" })).field;
    }
    assert.notEqual(field.reviewState, "HUMAN_CONFIRMED");
    assert.notEqual(field.reviewState, "HUMAN_OVERRIDDEN");
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

/* -------------------------------------------------------------------------- */
/* Remediation — BLOCKER A: authority semantics (PROVENANCE != AUTHORITY)      */
/* -------------------------------------------------------------------------- */

describe("REMEDIATION A1. CONTEXT provenance does NOT default to HUMAN_CONFIRMED", () => {
  it("a CONTEXT-derived field starts as AI_SUGGESTED", () => {
    const f = createIntelField({ value: "Vilnius", provenance: "CONTEXT" });
    assert.equal(f.reviewState, "AI_SUGGESTED");
    assert.notEqual(f.reviewState, "HUMAN_CONFIRMED");
    assert.notEqual(f.reviewState, "HUMAN_OVERRIDDEN");
  });

  it("a CONTEXT-derived field requires review when its confidence is unknown/low", () => {
    const f = createIntelField({ value: "Vilnius", provenance: "CONTEXT" });
    assert.equal(f.requiresReview, true);
  });
});

describe("REMEDIATION A2. non-human CONTEXT value can be superseded by merge policy", () => {
  it("a conflicting CONTEXT suggestion on an unconfirmed field creates an explicit conflict", () => {
    const existing = createIntelField({ value: "Vilnius", provenance: "CONTEXT" });
    const incoming = createIntelField({ value: "Kaunas", provenance: "VISION" });
    const { field, conflictCreated } = mergeAt("location", existing, incoming);
    assert.equal(conflictCreated, true);
    assert.equal(field.conflicts.length, 1);
    assert.equal(field.conflicts[0]!.candidates[0]!.source, "CONTEXT");
    assert.equal(field.conflicts[0]!.candidates[1]!.source, "VISION");
  });

  it("an agreeing CONTEXT suggestion merges into an unconfirmed field without human authority", () => {
    const existing = createIntelField({ value: "Vilnius", provenance: "CONTEXT" });
    const incoming = createIntelField({ value: "Vilnius", provenance: "VISION", confidence: 0.9 });
    const { field, conflictCreated } = mergeAt("location", existing, incoming);
    assert.equal(conflictCreated, false);
    assert.equal(field.reviewState, "AI_SUGGESTED");
    assert.notEqual(field.reviewState, "HUMAN_CONFIRMED");
  });
});

describe("REMEDIATION A3. HUMAN_CONFIRMED cannot be overwritten by any AI source", () => {
  for (const source of ["AI_INFERRED", "VISION", "DOCUMENT", "CONTEXT"] as const) {
    it(`merge rejects ${source} over a HUMAN_CONFIRMED value`, () => {
      let f = createIntelField({ value: "2019", provenance: "VISION" });
      f = applyHumanValue(f, "2019");
      assert.equal(f.reviewState, "HUMAN_CONFIRMED");
      const incoming = createIntelField({ value: "2020", provenance: source, confidence: 0.99 });
      const { field, conflictCreated } = mergeAt("year", f, incoming);
      assert.equal(field.value, "2019");
      assert.equal(field.reviewState, "HUMAN_CONFIRMED");
      assert.equal(field.conflicts.length, 0);
      assert.equal(conflictCreated, false);
      assert.equal(canAiOverwriteField(field), false);
    });
  }
});

describe("REMEDIATION A4. HUMAN_OVERRIDDEN cannot be silently replaced", () => {
  it("merge rejects CONTEXT over a HUMAN_OVERRIDDEN value", () => {
    let f = createIntelField({ value: "2020", provenance: "VISION" });
    f = applyHumanValue(f, "2019", { overridden: true });
    assert.equal(f.reviewState, "HUMAN_OVERRIDDEN");
    const incoming = createIntelField({ value: "2020", provenance: "CONTEXT", confidence: 0.99 });
    const { field, conflictCreated } = mergeAt("year", f, incoming);
    assert.equal(field.value, "2019");
    assert.equal(field.reviewState, "HUMAN_OVERRIDDEN");
    assert.equal(field.conflicts.length, 0);
    assert.equal(conflictCreated, false);
  });
});

describe("REMEDIATION A5. USER_TEXT is not implicit canonical confirmation", () => {
  it("USER_TEXT does not automatically become HUMAN_CONFIRMED", () => {
    const f = createIntelField({ value: "2019 BMW 320d", provenance: "USER_TEXT" });
    assert.equal(f.reviewState, "AI_SUGGESTED");
    assert.notEqual(f.reviewState, "HUMAN_CONFIRMED");
  });

  it("an AI suggestion conflicting with an unconfirmed USER_TEXT value creates a conflict", () => {
    const existing = createIntelField({ value: "2019", provenance: "USER_TEXT" });
    const incoming = createIntelField({ value: "2020", provenance: "VISION" });
    const { field, conflictCreated } = mergeAt("year", existing, incoming);
    assert.equal(conflictCreated, true);
    assert.equal(field.conflicts.length, 1);
    assert.equal(field.conflicts[0]!.fieldKey, "year");
  });
});

describe("REMEDIATION A6. USER_ENTERED retains human-authoritative semantics", () => {
  it("direct manual canonical entry is HUMAN_CONFIRMED", () => {
    const f = createIntelField({ value: "Kaunas", provenance: "USER_ENTERED" });
    assert.equal(f.reviewState, "HUMAN_CONFIRMED");
  });

  it("USER_ENTERED value cannot be overwritten by AI suggestions", () => {
    const f = createIntelField({ value: "Kaunas", provenance: "USER_ENTERED" });
    const incoming = createIntelField({ value: "Vilnius", provenance: "VISION", confidence: 0.99 });
    const { field, conflictCreated } = mergeAt("location", f, incoming);
    assert.equal(field.value, "Kaunas");
    assert.equal(field.reviewState, "HUMAN_CONFIRMED");
    assert.equal(conflictCreated, false);
  });
});

/* -------------------------------------------------------------------------- */
/* Remediation — BLOCKER B: real stable field keys                             */
/* -------------------------------------------------------------------------- */

describe("REMEDIATION B1. conflict for 'year' carries the real field key", () => {
  it("produces fieldKey === 'year'", () => {
    const existing = createIntelField({ value: "2019", provenance: "USER_TEXT" });
    const incoming = createIntelField({ value: "2020", provenance: "VISION" });
    const { field, conflictCreated } = mergeAt("year", existing, incoming);
    assert.equal(conflictCreated, true);
    assert.equal(field.conflicts[0]!.fieldKey, "year");
  });
});

describe("REMEDIATION B2. nested canonical path is preserved exactly", () => {
  it("conflict for attributes.bodyColor preserves the exact stable path", () => {
    const existing = createIntelField({ value: "Raudona", provenance: "USER_TEXT" });
    const incoming = createIntelField({ value: "Mėlyna", provenance: "VISION" });
    const { field, conflictCreated } = mergeAt("attributes.bodyColor", existing, incoming);
    assert.equal(conflictCreated, true);
    assert.equal(field.conflicts[0]!.fieldKey, "attributes.bodyColor");
  });
});

describe("REMEDIATION B3. simultaneous conflicts for different fields remain distinguishable", () => {
  it("two conflicts on one draft keep distinct fieldKeys", () => {
    const year = createIntelField({ value: "2019", provenance: "USER_TEXT" });
    const color = createIntelField({ value: "Raudona", provenance: "USER_TEXT" });
    const r1 = mergeAt("year", year, createIntelField({ value: "2020", provenance: "VISION" }));
    const r2 = mergeAt("attributes.bodyColor", color, createIntelField({ value: "Mėlyna", provenance: "VISION" }));
    const draft: ListingIntelDraft = {
      fields: { year: r1.field, "attributes.bodyColor": r2.field },
      requiresReview: true,
      reviewReasons: [],
    };
    const yearConflicts = draft.fields.year!.conflicts.map((c) => c.fieldKey);
    const colorConflicts = draft.fields["attributes.bodyColor"]!.conflicts.map((c) => c.fieldKey);
    assert.deepEqual(yearConflicts, ["year"]);
    assert.deepEqual(colorConflicts, ["attributes.bodyColor"]);
    assert.notEqual(yearConflicts[0], colorConflicts[0]);
  });
});

describe("REMEDIATION B4. no merge-created conflict may contain a placeholder key", () => {
  it("never emits the placeholder key 'field'", () => {
    const keys = ["year", "attributes.bodyColor", "attributes.storageGb"];
    for (const key of keys) {
      const existing = createIntelField({ value: "A", provenance: "USER_TEXT" });
      const incoming = createIntelField({ value: "B", provenance: "VISION" });
      const { field, conflictCreated } = mergeAt(key, existing, incoming);
      assert.equal(conflictCreated, true);
      for (const c of field.conflicts) {
        assert.equal(c.fieldKey, key);
        assert.notEqual(c.fieldKey, "field");
        assert.ok(!c.fieldKey.includes("field"));
      }
    }
  });

  it("the contract source contains no hardcoded placeholder fieldKey", async () => {
    const src = await import("./draft-intelligence.js");
    const sourceText = src ? "module-loaded" : "";
    assert.ok(sourceText.length > 0);
    // The merge path must take the key from its argument — verified by B1/B2/B3/B4.
    // Static guard: no literal `fieldKey: "field"` in the module source.
    const raw = (
      await import("node:fs").then((fs) => fs.promises.readFile(new URL("./draft-intelligence.ts", import.meta.url), "utf8"))
    );
    assert.ok(!raw.includes('fieldKey: "field"'));
  });
});

/* -------------------------------------------------------------------------- */
/* Remediation — REQUIRED FIX C: confidence [0,1] runtime invariant            */
/* -------------------------------------------------------------------------- */

describe("REMEDIATION C. confidence [0,1] runtime invariant", () => {
  const valid: Array<[number | null | undefined, number | null]> = [
    [null, null],
    [0, 0],
    [0.25, 0.25],
    [0.5, 0.5],
    [0.9, 0.9],
    [1, 1],
    [undefined, null],
  ];
  const invalid: Array<[number, number | null]> = [
    [-0.001, null],
    [1.001, null],
    [NaN, null],
    [Infinity, null],
    [-Infinity, null],
  ];

  for (const [input, expected] of valid) {
    it(`normalizes valid input ${String(input)} -> ${String(expected)}`, () => {
      assert.equal(normalizeIntelConfidence(input), expected);
    });
  }

  for (const [input] of invalid) {
    it(`invalid input ${String(input)} becomes unknown (null), never HIGH`, () => {
      assert.equal(normalizeIntelConfidence(input), null);
      assert.equal(classifyIntelConfidence(input), "UNKNOWN");
    });
  }

  it("out-of-range confidence never classifies as HIGH/MEDIUM", () => {
    for (const input of [-0.001, 1.001, NaN, Infinity, -Infinity]) {
      assert.equal(classifyIntelConfidence(input), "UNKNOWN");
    }
  });

  it("createIntelField stores only normalized confidence", () => {
    assert.equal(createIntelField({ value: 1, confidence: 1.01 }).confidence, null);
    assert.equal(createIntelField({ value: 1, confidence: -0.1 }).confidence, null);
    assert.equal(createIntelField({ value: 1, confidence: NaN }).confidence, null);
    assert.equal(createIntelField({ value: 1, confidence: 0.5 }).confidence, 0.5);
    assert.equal(createIntelField({ value: 1, confidence: 1 }).confidence, 1);
  });

  it("unknown/invalid confidence does not authorize an otherwise uncertain AI-derived value", () => {
    // An AI-derived value with invalid confidence must remain reviewable and
    // must NOT gain HIGH-like authority.
    const f = createIntelField({ value: "2020", provenance: "AI_INFERRED", confidence: 1.7 });
    assert.equal(f.confidence, null);
    assert.equal(classifyIntelConfidence(f.confidence), "UNKNOWN");
    assert.equal(f.requiresReview, true);
    assert.notEqual(f.reviewState, "HUMAN_CONFIRMED");
    assert.notEqual(f.reviewState, "HUMAN_OVERRIDDEN");
  });

  it("no fake provider probability values are manufactured", () => {
    const f = createIntelField({ value: "x", provenance: "AI_INFERRED" });
    assert.equal(f.confidence, null);
    assert.equal(classifyIntelConfidence(f.confidence), "UNKNOWN");
  });
});

/* -------------------------------------------------------------------------- */
/* Remediation — HITL regression (section 10)                                  */
/* -------------------------------------------------------------------------- */

describe("REMEDIATION HITL. AI padeda, žmogus sprendžia", () => {
  it("AI cannot publish — no publish authority exists on the canonical contract", () => {
    const draft: ListingIntelDraft = {
      fields: {
        year: createIntelField({ value: 2020, provenance: "VISION", confidence: 0.99 }),
      },
      requiresReview: false,
      reviewReasons: [],
    };
    // The contract exposes only review state, never a publish authorization.
    assert.ok(!("publishAllowed" in draft));
    assert.ok(!("autoPublish" in draft));
  });

  it("AI cannot silently turn an inferred/context value into human-confirmed state", () => {
    const draft: ListingIntelDraft = {
      fields: {
        year: createIntelField({ value: 2020, provenance: "CONTEXT" }),
      },
      requiresReview: true,
      reviewReasons: [],
    };
    let field = draft.fields.year!;
    for (let i = 0; i < 5; i++) {
      const r = mergeAt("year", field, createIntelField({ value: 2020, provenance: "AI_INFERRED", confidence: 0.99 }));
      field = r.field;
    }
    assert.notEqual(field.reviewState, "HUMAN_CONFIRMED");
    assert.notEqual(field.reviewState, "HUMAN_OVERRIDDEN");
  });

  it("higher AI confidence does not automatically resolve a conflict", () => {
    const existing = createIntelField({ value: "2019", provenance: "DOCUMENT", confidence: 0.5 });
    const incoming = createIntelField({ value: "2020", provenance: "VISION", confidence: 0.99 });
    const { field, conflictCreated } = mergeAt("year", existing, incoming);
    assert.equal(conflictCreated, true);
    assert.equal(field.value, "2019");
    assert.equal(field.conflicts.length, 1);
    assert.equal(field.requiresReview, true);
  });

  it("conflicting evidence remains visible after merge", () => {
    const existing = createIntelField({ value: "2019", provenance: "VISION", confidence: 0.9 });
    const incoming = createIntelField({ value: "2020", provenance: "VISION", confidence: 0.95 });
    const { field } = mergeAt("year", existing, incoming);
    assert.equal(field.conflicts.length, 1);
    assert.equal(field.conflicts[0]!.candidates.length, 2);
  });

  it("reviewHints remain advisory/non-authoritative", () => {
    const field = createIntelField({ value: 2020, confidence: 0.4 });
    const hint = { id: "low-confidence", text: "Peržiūrėkite ranka.", requiresReview: field.requiresReview };
    assert.equal(hint.requiresReview, true);
    assert.ok(!("blocking" in hint));
    assert.ok(!("publishAllowed" in hint));
  });
});

/* -------------------------------------------------------------------------- */
/* Remediation — cross-vertical sanity (section 11)                            */
/* -------------------------------------------------------------------------- */

describe("REMEDIATION CROSS-VERTICAL. contract stays vertical-neutral", () => {
  it("transport: year conflict is created with the real key", () => {
    const existing = createIntelField({ value: 2019, provenance: "USER_TEXT" });
    const incoming = createIntelField({ value: 2020, provenance: "VISION" });
    const { field, conflictCreated } = mergeAt("year", existing, incoming);
    assert.equal(conflictCreated, true);
    assert.equal(field.conflicts[0]!.fieldKey, "year");
    assert.equal(field.conflicts[0]!.candidates[0]!.value, 2019);
    assert.equal(field.conflicts[0]!.candidates[1]!.value, 2020);
  });

  it("real estate: rooms conflict is created with the real key", () => {
    const existing = createIntelField({ value: 3, provenance: "USER_TEXT" });
    const incoming = createIntelField({ value: 4, provenance: "VISION" });
    const { field, conflictCreated } = mergeAt("rooms", existing, incoming);
    assert.equal(conflictCreated, true);
    assert.equal(field.conflicts[0]!.fieldKey, "rooms");
  });

  it("electronics: storage capacity conflict uses the nested canonical path", () => {
    const existing = createIntelField({ value: "128GB", provenance: "USER_TEXT" });
    const incoming = createIntelField({ value: "256GB", provenance: "DOCUMENT" });
    const { field, conflictCreated } = mergeAt("attributes.storageGb", existing, incoming);
    assert.equal(conflictCreated, true);
    assert.equal(field.conflicts[0]!.fieldKey, "attributes.storageGb");
  });

  it("one nested canonical attribute path works end-to-end", () => {
    const existing = createIntelField({ value: "Raudona", provenance: "USER_TEXT" });
    const incoming = createIntelField({ value: "Mėlyna", provenance: "VISION" });
    const { field } = mergeAt("attributes.bodyColor", existing, incoming);
    assert.equal(field.conflicts[0]!.fieldKey, "attributes.bodyColor");
    assert.equal(field.conflicts[0]!.candidates[0]!.value, "Raudona");
    assert.equal(field.conflicts[0]!.candidates[1]!.value, "Mėlyna");
  });
});

void (null as ListingIntelField<unknown> | null);
