/**
 * Universal Fact-Evidence Contract — balanced cross-vertical evaluation.
 *
 * Category-neutral proofs only: the contract has no vertical knowledge, so
 * every scenario here passes category/field names ONLY as test labels. The
 * matrix covers real estate, electronics, clothing/general goods, services,
 * jobs, transport (one equal reference), home/garden and unknown categories.
 *
 * Repository-native co-located pattern (same as marketplace-domain tests):
 * run from the server package with `npx tsx --test ../shared/fact-evidence.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateFactEvidence,
  type FactEvidence,
} from "./fact-evidence.ts";

const ev = (
  value: string,
  source: FactEvidence["source"],
  status: FactEvidence["status"] = "UNCONFIRMED",
  reason?: string
): FactEvidence => ({ value, source, status, ...(reason ? { reason } : {}) });

describe("Universal fact-evidence contract — balanced cross-vertical scenarios", () => {
  it("real_estate: document 62 m² vs user claim 64 m² → CONFLICT, neither silently wins", () => {
    const r = evaluateFactEvidence(
      ev("62", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "ntr-registras.pdf"),
      ev("64", "USER_CLAIM")
    );
    assert.equal(r.decision, "CONFLICT");
    assert.equal(r.record?.value, "62", "existing evidence stays canonical");
    assert.equal(r.conflictWith?.value, "64");
  });

  it("electronics: label 128 GB vs model inference 256 GB → unsupported overwrite rejected", () => {
    const r = evaluateFactEvidence(
      ev("128", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "etikete.jpg"),
      ev("256", "MODEL_INFERENCE")
    );
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(r.record?.value, "128", "label observation preserved");
  });

  it("clothing: label L vs explicit correction M → ACCEPT_CORRECTION as a human claim", () => {
    const r = evaluateFactEvidence(
      ev("L", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "care-label"),
      ev("M", "USER_CLAIM", "HUMAN_CONFIRMED"),
      { isExplicitCorrection: true }
    );
    assert.equal(r.decision, "ACCEPT_CORRECTION");
    assert.equal(r.record?.value, "M");
    assert.equal(r.record?.source, "USER_CORRECTION");
    assert.equal(r.record?.status, "HUMAN_CONFIRMED", "confirmation is a claim, not verification");
    assert.equal(r.conflictWith, undefined);
  });

  it("services: claim Kaunas then explicit correction Vilnius → ACCEPT_CORRECTION, no false conflict", () => {
    const r = evaluateFactEvidence(
      ev("kaunas", "USER_CLAIM"),
      ev("vilnius", "USER_CLAIM"),
      { isExplicitCorrection: true }
    );
    assert.equal(r.decision, "ACCEPT_CORRECTION");
    assert.equal(r.record?.value, "vilnius");
    assert.equal(r.record?.status, "UNCONFIRMED", "correction without confirmation is not confirmed");
  });

  it("jobs: persisted 'office' vs user claim 'remote' without correction intent → CONFLICT", () => {
    const r = evaluateFactEvidence(
      ev("office", "EXISTING_PERSISTED_VALUE"),
      ev("remote", "USER_CLAIM")
    );
    assert.equal(r.decision, "CONFLICT", "persisted value is not verified authority");
    assert.equal(r.record?.value, "office");
  });

  it("transport (equal reference): claim 160000 km then non-explicit 180000 km → CONFLICT", () => {
    const r = evaluateFactEvidence(
      ev("160000", "USER_CLAIM"),
      ev("180000", "USER_CLAIM")
    );
    assert.equal(r.decision, "CONFLICT");
    // No VIN / vehicle authority logic exists in this contract — provenance
    // is what it is regardless of the field.
    assert.equal(r.record?.value, "160000");
    assert.equal(r.conflictWith?.value, "180000");
  });

  it("home/garden: visual 'wood' vs user claim 'laminate' → CONFLICT; observation is never verified", () => {
    const r = evaluateFactEvidence(
      ev("wood", "VISUAL_OBSERVATION"),
      ev("laminate", "USER_CLAIM")
    );
    assert.equal(r.decision, "CONFLICT");
    assert.notEqual(r.record?.status, "INDEPENDENTLY_VERIFIED", "visual observation never verifies");
  });

  it("unknown/future category: model inference alone → INSUFFICIENT_EVIDENCE, no canonical verified value", () => {
    const r = evaluateFactEvidence(null, ev("whatever", "MODEL_INFERENCE"));
    assert.equal(r.decision, "INSUFFICIENT_EVIDENCE");
    assert.equal(r.record, null, "nothing may be stored canonically");
  });
});

describe("Universal fact-evidence contract — semantic rules", () => {
  it("identical normalized values from different sources merge as SAME_VALUE", () => {
    const r = evaluateFactEvidence(
      ev("baltas", "DOCUMENT_OBSERVATION"),
      ev("baltas", "USER_CLAIM", "HUMAN_CONFIRMED")
    );
    assert.equal(r.decision, "SAME_VALUE");
    assert.equal(r.record?.value, "baltas");
    assert.equal(r.record?.status, "HUMAN_CONFIRMED", "strongest status wins on agreement");
  });

  it("human confirmation creates a HUMAN_CONFIRMED claim, never verification", () => {
    const r = evaluateFactEvidence(null, ev("kaunas", "USER_CLAIM"), { isHumanConfirmation: true });
    assert.equal(r.record?.status, "HUMAN_CONFIRMED");
    assert.notEqual(r.record?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("only TRUSTED_VERIFICATION may produce INDEPENDENTLY_VERIFIED", () => {
    const r = evaluateFactEvidence(null, ev("WBAZZZ8VZM1234567", "TRUSTED_VERIFICATION"));
    assert.equal(r.decision, "SAME_VALUE");
    assert.equal(r.record?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("a later trusted verification supersedes prior evidence and verifies", () => {
    const r = evaluateFactEvidence(
      ev("WBAZZZ8VZM1234567", "USER_CLAIM", "HUMAN_CONFIRMED"),
      ev("WBAZZZ8VZM1234567", "TRUSTED_VERIFICATION")
    );
    assert.equal(r.record?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("model inference cannot overwrite an independently verified value", () => {
    const r = evaluateFactEvidence(
      ev("WBAZZZ8VZM1234567", "TRUSTED_VERIFICATION", "INDEPENDENTLY_VERIFIED"),
      ev("VF3XXXXXXXXX99999", "MODEL_INFERENCE")
    );
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(r.record?.value, "WBAZZZ8VZM1234567");
    assert.equal(r.record?.status, "INDEPENDENTLY_VERIFIED");
  });

  it("model inference cannot overwrite a human-confirmed claim", () => {
    const r = evaluateFactEvidence(
      ev("M", "USER_CLAIM", "HUMAN_CONFIRMED"),
      ev("L", "MODEL_INFERENCE")
    );
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(r.record?.value, "M");
  });

  it("explicit correction of a verified value yields a human claim and keeps verified history", () => {
    const r = evaluateFactEvidence(
      ev("WBAZZZ8VZM1234567", "TRUSTED_VERIFICATION", "INDEPENDENTLY_VERIFIED"),
      ev("VF3XXXXXXXXX99999", "USER_CLAIM"),
      { isExplicitCorrection: true }
    );
    assert.equal(r.decision, "ACCEPT_CORRECTION");
    assert.equal(r.record?.value, "VF3XXXXXXXXX99999");
    assert.notEqual(r.record?.status, "INDEPENDENTLY_VERIFIED", "replaced value is not re-verified");
    assert.ok(r.history.some((e) => e.status === "INDEPENDENTLY_VERIFIED"), "verified evidence retained in history");
  });

  it("correction intent is never inferred from a differing value alone", () => {
    const r = evaluateFactEvidence(ev("kaunas", "USER_CLAIM"), ev("vilnius", "USER_CLAIM"));
    assert.equal(r.decision, "CONFLICT", "without the explicit signal it stays a conflict");
  });

  it("unknown incoming source fails closed", () => {
    const r = evaluateFactEvidence(
      ev("62", "DOCUMENT_OBSERVATION"),
      { value: "64", source: "HACKED_SOURCE" as FactEvidence["source"], status: "UNCONFIRMED" }
    );
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(r.record?.value, "62");
  });

  it("unknown incoming status fails closed", () => {
    const r = evaluateFactEvidence(
      null,
      { value: "64", source: "USER_CLAIM", status: "SOMEHOW_VERIFIED" as FactEvidence["status"] }
    );
    assert.equal(r.decision, "REJECT_UNSUPPORTED_INFERENCE");
    assert.equal(r.record, null);
  });

  it("unknown source/status on the CURRENT record makes it untrusted, never authority", () => {
    const r = evaluateFactEvidence(
      { value: "x", source: "HACKED_SOURCE" as FactEvidence["source"], status: "UNCONFIRMED" },
      ev("y", "USER_CLAIM")
    );
    assert.equal(r.decision, "SAME_VALUE", "untrusted current is treated as absent");
    assert.equal(r.record?.value, "y");
  });

  it("never mutates its inputs (deep-frozen)", () => {
    const current = Object.freeze({ ...ev("62", "DOCUMENT_OBSERVATION", "UNCONFIRMED", "doc.pdf") });
    const incoming = Object.freeze({ ...ev("64", "USER_CLAIM") });
    evaluateFactEvidence(current, incoming);
    assert.deepEqual(current, { value: "62", source: "DOCUMENT_OBSERVATION", status: "UNCONFIRMED", reason: "doc.pdf" });
    assert.deepEqual(incoming, { value: "64", source: "USER_CLAIM", status: "UNCONFIRMED" });
  });

  it("deterministic repeated execution produces identical results", () => {
    const args = () => evaluateFactEvidence(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assert.deepEqual(args(), args());
  });

  it("normalization is supplied by the caller — the contract never normalizes", () => {
    // Different raw strings without caller normalization are materially different → CONFLICT.
    const unnormalized = evaluateFactEvidence(ev("62 m²", "DOCUMENT_OBSERVATION"), ev("62m2", "USER_CLAIM"));
    assert.equal(unnormalized.decision, "CONFLICT", "contract must not hide normalization");
    // The same strings, already normalized by the caller, agree.
    const normalized = evaluateFactEvidence(ev("62", "DOCUMENT_OBSERVATION"), ev("62", "USER_CLAIM"));
    assert.equal(normalized.decision, "SAME_VALUE");
  });

  it("history is append-only and shares nothing with inputs", () => {
    const r = evaluateFactEvidence(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assert.equal(r.history.length, 2);
    assert.equal(r.history[0].value, "62");
    assert.equal(r.history[1].value, "64");
    // Mutating the returned history must not affect future evaluations.
    (r.history as unknown[]).push("junk");
    const again = evaluateFactEvidence(ev("62", "DOCUMENT_OBSERVATION"), ev("64", "USER_CLAIM"));
    assert.equal(again.history.length, 2);
  });
});
