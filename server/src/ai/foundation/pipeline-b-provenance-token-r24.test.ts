/**
 * R2.4/R2.5 — server-bound AI provenance + explicit human confirmation (HMAC).
 *
 * MODEL_INFERENCE is a non-canonical proposal keyed by an HMAC provenance
 * token. It becomes publishable ONLY after an explicit whole-description
 * acceptance mints a separate HUMAN_CONFIRMED artifact bound to the exact text.
 * The publish decision derives from these server-issued artifacts — never from
 * the mutable browser label, and never from a generic publish click.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signModelInferenceProposal,
  verifyModelInferenceProposal,
  signHumanConfirmedDescription,
  resolveDescriptionPublishDecision,
  resolveUserDescriptionPrecedence,
} from "../../shared/description-provenance.js";

const KEY = "r24-test-signing-key";
const AI_DESCRIPTION =
  "Parduodamas 62 m², 3 kambarių butas Antakalnyje su balkonu, parkingu, ramioje vietoje, puikiai apšviestas.";

describe("R2.4 — server-issued provenance artifact (HMAC)", () => {
  it("sign + verify round-trip for the exact description", () => {
    const token = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    assert.equal(verifyModelInferenceProposal(AI_DESCRIPTION, token, KEY), true);
  });

  it("tampered description fails verification (stale token)", () => {
    const token = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    assert.equal(verifyModelInferenceProposal(AI_DESCRIPTION + " (pataisyta)", token, KEY), false);
  });

  it("tampered token fails verification", () => {
    const token = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    assert.equal(verifyModelInferenceProposal(AI_DESCRIPTION, token + "ff", KEY), false);
  });
});

describe("R2.4/R2.5 — publish decision derives from server artifacts, not the label", () => {
  it("A. untouched AI proposal (valid provenance token, no confirmation) → reject_unpromoted", () => {
    const token = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    assert.equal(
      resolveDescriptionPublishDecision(AI_DESCRIPTION, token, undefined, KEY),
      "reject_unpromoted"
    );
  });

  it("B/C. provenance token is authoritative regardless of any client label", () => {
    const token = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    // The decision function takes NO descriptionSource label at all.
    assert.equal(
      resolveDescriptionPublishDecision(AI_DESCRIPTION, token, undefined, KEY),
      "reject_unpromoted"
    );
  });

  it("D. tampered provenance token → reject_invalid", () => {
    const token = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    assert.equal(
      resolveDescriptionPublishDecision(AI_DESCRIPTION, token + "x", undefined, KEY),
      "reject_invalid"
    );
  });

  it("D. explicit confirmation (valid artifact, exact text) → accept", () => {
    const conf = signHumanConfirmedDescription(AI_DESCRIPTION, KEY);
    assert.equal(
      resolveDescriptionPublishDecision(AI_DESCRIPTION, undefined, conf, KEY),
      "accept"
    );
  });

  it("E. edit after confirmation → stale confirmation → reject_invalid", () => {
    const conf = signHumanConfirmedDescription(AI_DESCRIPTION, KEY);
    assert.equal(
      resolveDescriptionPublishDecision(AI_DESCRIPTION + ".", undefined, conf, KEY),
      "reject_invalid"
    );
  });

  it("F. forged browser label with no valid confirmation → still rejected (AI proposal)", () => {
    const token = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    // Even if the client claims HUMAN_CONFIRMED, no valid artifact → reject.
    assert.equal(
      resolveDescriptionPublishDecision(AI_DESCRIPTION, token, undefined, KEY),
      "reject_unpromoted"
    );
  });

  it("G/H. no artifacts (manual listing / grounded) → accept", () => {
    assert.equal(resolveDescriptionPublishDecision("Rankinis aprašymas", undefined, undefined, KEY), "accept");
    assert.equal(resolveDescriptionPublishDecision(AI_DESCRIPTION, null, null, KEY), "accept");
  });
});

describe("R2.7 — AI lineage is preserved through edits (never falls to manual)", () => {
  it("B/C. edited AI text with STALE provenance → reject_invalid (NOT manual accept)", () => {
    const token = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    const edited = AI_DESCRIPTION + "."; // trivial edit → stale token
    assert.equal(
      resolveDescriptionPublishDecision(edited, token, undefined, KEY),
      "reject_invalid",
      "stale AI provenance must not fall through to the manual path"
    );
  });

  it("D. valid confirmation overrides stale AI provenance → accept", () => {
    const staleProvenance = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    const edited = AI_DESCRIPTION + ".";
    const conf = signHumanConfirmedDescription(edited, KEY);
    assert.equal(
      resolveDescriptionPublishDecision(edited, staleProvenance, conf, KEY),
      "accept"
    );
  });

  it("E. edit after confirmation keeps AI lineage → stale confirmation → reject_invalid", () => {
    const conf = signHumanConfirmedDescription(AI_DESCRIPTION, KEY);
    const staleProvenance = signModelInferenceProposal(AI_DESCRIPTION, KEY);
    const edited = AI_DESCRIPTION + ".";
    assert.equal(
      resolveDescriptionPublishDecision(edited, staleProvenance, conf, KEY),
      "reject_invalid"
    );
  });

  it("K. hostile complete token omission → accepted (documented stateless limitation)", () => {
    // A hostile browser that strips ALL artifacts presents the AI text as
    // manual. Without server-side draft/session state, the server cannot
    // distinguish it. This is reported truthfully, not masked.
    assert.equal(
      resolveDescriptionPublishDecision(AI_DESCRIPTION, undefined, undefined, KEY),
      "accept"
    );
  });
});

describe("R2.4 — USER_CORRECTION > MODEL_INFERENCE (merge precedence)", () => {
  it("user-authored description survives AI regeneration", () => {
    const r = resolveUserDescriptionPrecedence({
      previousSource: "USER_CORRECTION",
      previousDescription: "Mano paties aprašymas.",
      nextDescription: "AI pasiūlytas naujas aprašymas.",
      nextSource: "MODEL_INFERENCE",
    });
    assert.equal(r.description, "Mano paties aprašymas.");
    assert.equal(r.source, "USER_CORRECTION");
  });

  it("without user correction, the new (grounded/AI) description wins", () => {
    const r = resolveUserDescriptionPrecedence({
      previousSource: undefined,
      previousDescription: "",
      nextDescription: "Grounded aprašymas.",
      nextSource: "USER_CLAIM",
    });
    assert.equal(r.description, "Grounded aprašymas.");
    assert.equal(r.source, "USER_CLAIM");
  });
});
