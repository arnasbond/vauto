/**
 * Fact-Evidence Adapter — adversarial source mapping + seven-vertical-equivalent
 * field matrix (F2.1).
 *
 * The adapter is category-neutral and field-key-neutral: it maps a producer
 * source vocabulary into FactEvidenceSource and delegates every decision to
 * evaluateFactEvidence. The "seven verticals" below use REAL field keys only as
 * test labels to prove the contract does not depend on any category name; the
 * six/seven-vertical vs DB-category mismatch is resolved by construction because
 * the adapter never reads a category key at all.
 *
 * Repository-native co-located pattern (same as fact-evidence.test.ts): run from
 * the server package with `npx tsx --test ../shared/fact-evidence-adapter.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateFieldEvidence,
  stringifyFactValue,
  toFactEvidence,
  toFactEvidenceSource,
  type FactEvidenceProducerField,
} from "./fact-evidence-adapter.ts";
import type {
  FactEvidence,
  FactEvidenceState,
} from "./fact-evidence.ts";

const field = (value: unknown, source: string, evidence?: string[]): FactEvidenceProducerField => ({
  value,
  source,
  ...(evidence ? { evidence } : {}),
});

const PRODUCER_SOURCES = [
  "VISION",
  "TEXT",
  "VOICE",
  "COMBINED",
  "USER_PROVIDED",
  "OCR_UNTRUSTED",
  "USER_TEXT",
  "USER_ENTERED",
  "DOCUMENT",
  "SCHEMA",
  "CONTEXT",
  "AI_INFERRED",
  "UNKNOWN",
] as const;

/* -------------------------------------------------------------------------- */
/* Source mapping                                                              */
/* -------------------------------------------------------------------------- */

describe("F2.1 adapter — source mapping (deterministic, category-neutral)", () => {
  it("maps every producer source into a NON-trusted fact-evidence source (never TRUSTED_VERIFICATION)", () => {
    for (const source of PRODUCER_SOURCES) {
      const mapped = toFactEvidenceSource(source);
      assert.ok(mapped !== null, `${source} must map`);
      assert.notEqual(mapped, "TRUSTED_VERIFICATION", `${source} must never mint trusted verification`);
    }
  });

  it("maps human-entered/claimed sources to USER_CLAIM", () => {
    for (const source of ["USER_PROVIDED", "USER_ENTERED", "TEXT", "VOICE", "USER_TEXT"] as const) {
      assert.equal(toFactEvidenceSource(source), "USER_CLAIM", source);
    }
  });

  it("maps vision to VISUAL_OBSERVATION, media/document to DOCUMENT_OBSERVATION", () => {
    assert.equal(toFactEvidenceSource("VISION"), "VISUAL_OBSERVATION");
    for (const source of ["OCR_UNTRUSTED", "DOCUMENT"] as const) {
      assert.equal(toFactEvidenceSource(source), "DOCUMENT_OBSERVATION", source);
    }
  });

  it("maps derived/unknown sources to MODEL_INFERENCE (inference never authoritative)", () => {
    for (const source of ["COMBINED", "SCHEMA", "CONTEXT", "AI_INFERRED", "UNKNOWN"] as const) {
      assert.equal(toFactEvidenceSource(source), "MODEL_INFERENCE", source);
    }
  });

  it("passes FactEvidenceSource values through verbatim (idempotent)", () => {
    for (const source of ["USER_CLAIM", "USER_CORRECTION", "DOCUMENT_OBSERVATION", "VISUAL_OBSERVATION", "MODEL_INFERENCE", "EXISTING_PERSISTED_VALUE", "TRUSTED_VERIFICATION"] as const) {
      assert.equal(toFactEvidenceSource(source), source, source);
    }
  });

  it("fails closed on unrecognized source strings (adversarial mapping)", () => {
    for (const source of ["HACKED", "TRUSTED_VERIFICATION ", "trusted-verification", "", "DOCUMENT_OBSERVATION\n"]) {
      assert.equal(toFactEvidenceSource(source), null, JSON.stringify(source));
    }
    assert.equal(evaluateFieldEvidence(null, field("v", "HACKED")), null);
    assert.equal(toFactEvidence(field("v", "HACKED")), null);
  });
});

/* -------------------------------------------------------------------------- */
/* Value stringification / normalization boundary                              */
/* -------------------------------------------------------------------------- */

describe("F2.1 adapter — normalization boundary (documented, never semantic)", () => {
  it("stringifies primitives mechanically, without trimming/case-folding/unit conversion", () => {
    assert.equal(stringifyFactValue("62"), "62");
    assert.equal(stringifyFactValue(62), "62");
    assert.equal(stringifyFactValue(true), "true");
    assert.equal(stringifyFactValue(false), "false");
    assert.equal(stringifyFactValue(" 62 "), " 62 ", "whitespace is preserved — the contract compares byte-equal");
    assert.equal(stringifyFactValue("62 m²"), "62 m²", "no unit normalization");
  });

  it("yields null (no evidence) for empty/unrepresentable values", () => {
    assert.equal(stringifyFactValue(null), null);
    assert.equal(stringifyFactValue(undefined), null);
    assert.equal(stringifyFactValue(""), null);
    assert.equal(stringifyFactValue(Number.NaN), null);
    assert.equal(stringifyFactValue(Number.POSITIVE_INFINITY), null);
    assert.equal(stringifyFactValue(() => 1), null);
  });

  it("does NOT normalize: differently-spelled values CONFLICT, identical values SAME_VALUE", () => {
    const s1 = evaluateFieldEvidence(null, field("62 m²", "DOCUMENT"));
    assert.equal(s1!.decision, "ACCEPT_EVIDENCE");
    const conflict = evaluateFieldEvidence(s1!.state, field("62m2", "TEXT"));
    assert.equal(conflict!.decision, "CONFLICT", "no implicit normalization — different strings conflict");
    const same = evaluateFieldEvidence(null, field("62", "DOCUMENT"));
    const same2 = evaluateFieldEvidence(same!.state, field("62", "TEXT"));
    assert.equal(same2!.decision, "SAME_VALUE", "identical strings are the same fact");
  });
});

/* -------------------------------------------------------------------------- */
/* Seven-vertical-equivalent field matrix                                      */
/* -------------------------------------------------------------------------- */

describe("F2.1 adapter — seven-vertical-equivalent field matrix (field-key neutral)", () => {
  const matrix: Array<{
    vertical: string;
    fieldKey: string;
    candidate: FactEvidenceProducerField;
    expectedDecision: string;
  }> = [
    { vertical: "real_estate", fieldKey: "attributes.area", candidate: field("62", "DOCUMENT"), expectedDecision: "ACCEPT_EVIDENCE" },
    { vertical: "electronics", fieldKey: "attributes.storageGb", candidate: field("128", "VISION"), expectedDecision: "ACCEPT_EVIDENCE" },
    { vertical: "clothing", fieldKey: "attributes.size", candidate: field("L", "DOCUMENT"), expectedDecision: "ACCEPT_EVIDENCE" },
    { vertical: "services", fieldKey: "serviceLocation", candidate: field("Kaunas", "TEXT"), expectedDecision: "ACCEPT_EVIDENCE" },
    { vertical: "jobs", fieldKey: "attributes.workType", candidate: field("remote", "AI_INFERRED"), expectedDecision: "INSUFFICIENT_EVIDENCE" },
    { vertical: "transport", fieldKey: "attributes.mileage", candidate: field("160000", "VOICE"), expectedDecision: "ACCEPT_EVIDENCE" },
    { vertical: "home/garden", fieldKey: "attributes.material", candidate: field("wood", "VISION"), expectedDecision: "ACCEPT_EVIDENCE" },
  ];

  it("each vertical's representative first-evidence field resolves deterministically", () => {
    for (const { vertical, fieldKey, candidate, expectedDecision } of matrix) {
      const r = evaluateFieldEvidence(null, candidate);
      assert.ok(r, `${vertical}/${fieldKey} must produce a decision`);
      assert.equal(r!.decision, expectedDecision, `${vertical}/${fieldKey}`);
      if (expectedDecision === "ACCEPT_EVIDENCE") {
        assert.notEqual(r!.state.canonical?.status, "INDEPENDENTLY_VERIFIED", `${vertical}/${fieldKey} never verified by observation`);
      } else {
        assert.equal(r!.state.canonical, null, `${vertical}/${fieldKey} inference cannot establish a canonical`);
      }
    }
  });

  it("the decision is a pure function of (value, source), independent of field key or vertical label", () => {
    const doc62 = field("62", "DOCUMENT");
    const doc64 = field("64", "TEXT");
    for (const fieldKey of [
      "attributes.area", // real_estate
      "attributes.storageGb", // electronics
      "attributes.size", // clothing
      "serviceLocation", // services
      "attributes.workType", // jobs
      "attributes.mileage", // transport
      "attributes.material", // home/garden
    ]) {
      const s1 = evaluateFieldEvidence(null, doc62);
      const conflict = evaluateFieldEvidence(s1!.state, doc64);
      assert.equal(conflict!.decision, "CONFLICT", `${fieldKey}: document 62 vs claim 64 conflicts identically`);
      assert.equal(conflict!.state.canonical?.value, "62", `${fieldKey}: existing evidence stays canonical`);
      assert.equal(conflict!.conflictWith?.value, "64", `${fieldKey}: challenger recorded`);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Adversarial decision semantics                                              */
/* -------------------------------------------------------------------------- */

describe("F2.1 adapter — no untrusted TRUSTED_VERIFICATION", () => {
  it("a TRUSTED_VERIFICATION source without the authenticated flag fails closed", () => {
    const r = evaluateFieldEvidence(null, field("WBAZZZ8VZM1234567", "TRUSTED_VERIFICATION"));
    assert.equal(r!.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.match(r!.reason, /authenticated verification/i);
    assert.equal(r!.state.canonical, null);
  });

  it("no producer source can mint INDEPENDENTLY_VERIFIED through this adapter", () => {
    for (const source of PRODUCER_SOURCES) {
      const r = evaluateFieldEvidence(null, field("v", source));
      if (r) {
        assert.notEqual(r.state.canonical?.status, "INDEPENDENTLY_VERIFIED", source);
        assert.equal(r.state.canonical?.source === "TRUSTED_VERIFICATION", false, `${source} must never be trusted`);
      }
    }
  });
});

describe("F2.1 adapter — model inference cannot establish or overwrite", () => {
  it("inference alone cannot establish a canonical value", () => {
    const r = evaluateFieldEvidence(null, field("remote", "AI_INFERRED"));
    assert.equal(r!.decision, "INSUFFICIENT_EVIDENCE");
    assert.equal(r!.state.canonical, null);
  });

  it("inference cannot overwrite a human-confirmed value", () => {
    const claim = evaluateFieldEvidence(null, field("office", "USER_PROVIDED"));
    assert.equal(claim!.decision, "ACCEPT_EVIDENCE");
    assert.equal(claim!.state.canonical?.status, "HUMAN_CONFIRMED");
    const r = evaluateFieldEvidence(claim!.state, field("remote", "AI_INFERRED"));
    assert.equal(r!.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(r!.state.canonical?.value, "office", "human value preserved");
  });
});

describe("F2.1 adapter — conflict preservation, human correction, reverification", () => {
  it("two credible differing values conflict; existing evidence stays canonical", () => {
    const s1 = evaluateFieldEvidence(null, field("62", "DOCUMENT"));
    const r = evaluateFieldEvidence(s1!.state, field("64", "TEXT"));
    assert.equal(r!.decision, "CONFLICT");
    assert.equal(r!.state.canonical?.value, "62");
    assert.equal(r!.conflictWith?.value, "64");
  });

  it("explicit human correction replaces without manufacturing a conflict", () => {
    const s1 = evaluateFieldEvidence(null, field("Kaunas", "TEXT"));
    const r = evaluateFieldEvidence(s1!.state, field("Vilnius", "TEXT"), { isExplicitCorrection: true });
    assert.equal(r!.decision, "ACCEPT_CORRECTION");
    assert.equal(r!.state.canonical?.value, "Vilnius");
    assert.equal(r!.state.canonical?.source, "USER_CORRECTION");
    assert.equal(r!.state.canonical?.status, "UNCONFIRMED", "correction without confirmation is not confirmed");
  });

  it("correction intent is never inferred from a differing value alone", () => {
    const s1 = evaluateFieldEvidence(null, field("Kaunas", "TEXT"));
    const r = evaluateFieldEvidence(s1!.state, field("Vilnius", "TEXT"));
    assert.equal(r!.decision, "CONFLICT");
  });

  it("explicit correction against independently verified evidence demands re-verification", () => {
    const verified = evaluateFieldEvidence(null, field("WBAZZZ8VZM1234567", "TRUSTED_VERIFICATION"), { authenticatedVerification: true });
    assert.equal(verified!.decision, "ACCEPT_VERIFICATION");
    assert.equal(verified!.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
    const r = evaluateFieldEvidence(verified!.state, field("VF3XXXXXXXXX99999", "TEXT"), { isExplicitCorrection: true });
    assert.equal(r!.decision, "REQUIRES_REVERIFICATION");
    assert.equal(r!.state.canonical?.value, "WBAZZZ8VZM1234567");
    assert.equal(r!.state.canonical?.status, "INDEPENDENTLY_VERIFIED");
  });
});

describe("F2.1 adapter — malformed prior state stays closed (sticky INVALID_STATE)", () => {
  it("malformed canonical + new claim → INVALID_STATE, then still INVALID_STATE", () => {
    const bad = { value: "bad", source: "USER_CLAIM", status: "INDEPENDENTLY_VERIFIED" } as FactEvidence;
    const malformed: FactEvidenceState = { validity: "VALID", canonical: bad, history: [bad] };
    const first = evaluateFieldEvidence(malformed, field("y", "TEXT"));
    assert.equal(first!.decision, "INVALID_STATE");
    assert.equal(first!.state.validity, "INVALID");
    assert.equal(first!.state.canonical, null, "no new claim may become canonical");
    const second = evaluateFieldEvidence(first!.state, field("z", "TEXT"));
    assert.equal(second!.decision, "INVALID_STATE", "INVALID must never silently become VALID");
    assert.equal(second!.state.validity, "INVALID");
  });

  it("unknown source field yields no evidence and never corrupts a valid prior state", () => {
    const s1 = evaluateFieldEvidence(null, field("62", "DOCUMENT"));
    const none = evaluateFieldEvidence(s1!.state, field("junk", "HACKED"));
    assert.equal(none, null, "unknown source produces no decision, no mutation");
    assert.equal(s1!.state.canonical?.value, "62", "prior state untouched");
  });
});
