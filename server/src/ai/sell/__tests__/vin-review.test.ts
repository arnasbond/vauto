/**
 * VAUTO AI Maturity — Phase 2C: VIN provenance & explicit human confirmation
 * boundary.
 *
 * Layer: PURE VIN state-machine unit tests (server/src/vehicle/vin-review.ts →
 * shared/vin-review.ts). Deterministic reducer-only tests — no network, no LLM.
 * Live merge/integration coverage lives in `vin-review-live-merge.test.ts`;
 * publish-boundary coverage in `server/src/vehicle/__tests__/vin-publish-boundary.test.ts`;
 * client/server parity in `server/src/vehicle/__tests__/vin-contract-parity.test.ts`.
 *
 * Contract under test:
 *  - A VIN from ANY untrusted channel (photo OCR, document OCR, chat text, tool
 *    args, manual typing) becomes a candidate only — never canonical.
 *  - Canonical `attributes.vin` may be created ONLY by `confirmVin` with the
 *    exact normalized value AND the exact current `vinReviewId`.
 *  - Bare text ("taip", an exact VIN typed into chat, a plain chip label) never
 *    confirms — there is no free-text confirmation path at all.
 *  - Every review action (confirm/reject/correct) is generation-bound; stale
 *    actions are safe no-ops returning a typed non-success outcome.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyVinExtractionCandidate,
  applyVinManualEntryCandidate,
  applyVinStructuredReviewAction,
  buildVinReviewDisplayChips,
  buildVinReviewSideEffect,
  confirmVin,
  correctVin,
  deriveVinReviewState,
  redactVinReviewForModel,
  rejectVin,
  stripUntrustedVinMarkers,
  type VinExtraction,
  type VinReviewStructuredAction,
} from "../../../vehicle/vin-review.js";

const VALID_A = "WBAZZZ8VZM1234567"; // 17-char plausible VIN, source A
const VALID_B = "VF3XXXXXXXXX99999"; // 17-char plausible VIN, source B (disagrees with A)
const VALID_C = "1HGCM82633A004352"; // 17-char plausible VIN, source C

function extraction(value: string, source: VinExtraction["source"], confidence?: number): VinExtraction {
  return { value, source, confidence };
}

function withCandidate(value: string = VALID_A): Record<string, string> {
  return applyVinExtractionCandidate({}, extraction(value, "photo_ocr", 0.9));
}

describe("Phase 2C — deriveVinReviewState (pure read)", () => {
  it("no vin keys at all => absent", () => {
    assert.equal(deriveVinReviewState({}).status, "absent");
  });

  it("canonical vin WITHOUT confirmation markers => legacy_unconfirmed (never silently confirmed)", () => {
    const state = deriveVinReviewState({ vin: VALID_A });
    assert.equal(state.status, "legacy_unconfirmed");
  });

  it("canonical vin WITH a confirmation record => confirmed", () => {
    const state = deriveVinReviewState({
      vin: VALID_A,
      vinConfirmed: "true",
      vinConfirmedSource: "user_entered",
      vinConfirmedReviewId: "vr_1",
    });
    assert.equal(state.status, "confirmed");
  });

  it("pending candidate, no canonical => candidate", () => {
    const state = deriveVinReviewState(withCandidate(VALID_A));
    assert.equal(state.status, "candidate");
    assert.equal(state.candidate, VALID_A);
    assert.equal(state.candidateSource, "photo_ocr");
  });

  it("conflict markers present => conflict, regardless of confidence", () => {
    const a = applyVinExtractionCandidate({}, extraction(VALID_A, "photo_ocr", 0.99));
    const conflicted = applyVinExtractionCandidate(a, extraction(VALID_B, "document_ocr", 0.4));
    const state = deriveVinReviewState(conflicted);
    assert.equal(state.status, "conflict");
    assert.equal(state.candidate, VALID_A);
    assert.equal(state.conflictValue, VALID_B);
  });
});

describe("Phase 2C — REQUIRED 1/2/3/5: every untrusted channel creates a candidate only", () => {
  it("photo OCR VIN => candidate only, canonical absent", () => {
    const attrs = applyVinExtractionCandidate({}, extraction(VALID_A, "photo_ocr", 0.9));
    assert.equal(attrs.vin, undefined);
    assert.equal(attrs.vinCandidate, VALID_A);
    assert.equal(attrs.vinCandidateSource, "photo_ocr");
    assert.equal(attrs.vinUncertain, "true");
  });

  it("document OCR VIN => candidate only, canonical absent", () => {
    const attrs = applyVinExtractionCandidate({}, extraction(VALID_A, "document_ocr", 0.9));
    assert.equal(attrs.vin, undefined);
    assert.equal(attrs.vinCandidate, VALID_A);
    assert.equal(attrs.vinCandidateSource, "document_ocr");
  });

  it("unknown-source (chat text) VIN => candidate only, canonical absent", () => {
    const attrs = applyVinExtractionCandidate({}, extraction(VALID_A, "unknown", 0.5));
    assert.equal(attrs.vin, undefined);
    assert.equal(attrs.vinCandidate, VALID_A);
    assert.equal(attrs.vinCandidateSource, "unknown");
  });

  it("LLM/tool-argument VIN => candidate only, canonical absent", () => {
    const attrs = applyVinExtractionCandidate({}, extraction(VALID_A, "unknown", 1));
    assert.equal(attrs.vin, undefined);
    assert.equal(attrs.vinCandidate, VALID_A);
  });

  it("direct manual typing (applyVinManualEntryCandidate) => candidate only, canonical absent, fresh reviewId", () => {
    const attrs = applyVinManualEntryCandidate({}, VALID_A, "user_entered");
    assert.equal(attrs.vin, undefined);
    assert.equal(attrs.vinCandidate, VALID_A);
    assert.equal(attrs.vinCandidateSource, "user_entered");
    assert.ok(attrs.vinReviewId, "manual entry must mint a fresh review generation");
  });

  it("manual typing over a CONFIRMED canonical replaces authority: canonical cleared, candidate created, confirmation gone", () => {
    const candidate = withCandidate(VALID_A);
    const confirmed = confirmVin(candidate, {
      type: "confirm",
      value: VALID_A,
      reviewId: candidate.vinReviewId ?? "",
    }).attrs;
    assert.equal(deriveVinReviewState(confirmed).status, "confirmed");
    const edited = applyVinManualEntryCandidate(confirmed, VALID_B, "user_entered");
    assert.equal(edited.vin, undefined, "editing a persisted VIN removes its existing authority");
    assert.equal(edited.vinConfirmed, undefined);
    assert.equal(edited.vinCandidate, VALID_B);
    assert.equal(deriveVinReviewState(edited).status, "candidate");
  });
});

describe("Phase 2C — REQUIRED 6/7: invalid VINs are rejected; confidence/checksum never imply confirmation", () => {
  it("structurally implausible OCR garbage never becomes a candidate", () => {
    const attrs = applyVinExtractionCandidate({}, extraction("WBAINVALIDVIN0001", "photo_ocr", 0.95));
    assert.deepEqual(attrs, {});
  });

  it("too-short OCR fragment never becomes a candidate", () => {
    const attrs = applyVinExtractionCandidate({}, extraction("WBA123", "photo_ocr", 0.99));
    assert.deepEqual(attrs, {});
  });

  it("high confidence and a structurally valid VIN never skip straight to canonical", () => {
    const attrs = applyVinExtractionCandidate({}, extraction(VALID_A, "photo_ocr", 1));
    assert.equal(attrs.vin, undefined);
    assert.equal(deriveVinReviewState(attrs).status, "candidate");
  });

  it("manual entry of an implausible value clears stale authority but creates no candidate", () => {
    const attrs = applyVinManualEntryCandidate(withCandidate(VALID_A), "XYZ1", "user_entered");
    assert.equal(attrs.vinCandidate, undefined);
    assert.equal(attrs.vinConfirmed, undefined);
  });
});

describe("Phase 2C — REQUIRED 8: explicit confirm with exact value + current reviewId", () => {
  it("confirm with the exact candidate value + current reviewId promotes to canonical and clears markers", () => {
    const attrs = withCandidate(VALID_A);
    const result = confirmVin(attrs, {
      type: "confirm",
      value: VALID_A,
      reviewId: attrs.vinReviewId ?? "",
    });
    assert.equal(result.outcome, "applied");
    assert.equal(result.attrs.vin, VALID_A);
    assert.equal(result.attrs.vinConfirmed, "true");
    assert.equal(result.attrs.vinConfirmedReviewId, attrs.vinReviewId);
    assert.equal(result.attrs.vinCandidate, undefined);
    assert.equal(deriveVinReviewState(result.attrs).status, "confirmed");
  });

  it("normalization: lowercased / spaced value confirms against the same candidate", () => {
    const attrs = withCandidate(VALID_A);
    const result = confirmVin(attrs, {
      type: "confirm",
      value: `  ${VALID_A.toLowerCase()}  `,
      reviewId: attrs.vinReviewId ?? "",
    });
    assert.equal(result.outcome, "applied");
    assert.equal(result.attrs.vin, VALID_A);
  });

  it("double-confirming the same value after resolution is a not_found no-op that keeps the canonical", () => {
    const attrs = withCandidate(VALID_A);
    const first = confirmVin(attrs, {
      type: "confirm",
      value: VALID_A,
      reviewId: attrs.vinReviewId ?? "",
    });
    // The first confirm resolved the review — replaying the same action finds no
    // pending review and must never alter the already-confirmed canonical.
    const second = confirmVin(first.attrs, {
      type: "confirm",
      value: VALID_A,
      reviewId: attrs.vinReviewId ?? "",
    });
    assert.equal(second.outcome, "not_found");
    assert.equal(second.attrs.vin, VALID_A, "already-confirmed canonical must survive a replay");
    assert.equal(deriveVinReviewState(second.attrs).status, "confirmed");
  });
});

describe("Phase 2C — REQUIRED 9/10/11: free text NEVER confirms", () => {
  it("bare confirmation phrases are plain text — there is no free-text confirm path", () => {
    // Doctrine: any free-text resolver is permanently removed; the only authority
    // channel is a structured action. This asserts the structured reducer rejects
    // anything that is not the exact generation-bound action.
    const attrs = withCandidate(VALID_A);
    for (const phrase of ["taip", "Taip", "gerai", "ok", "tvirtinu", "viskas tinka"]) {
      const result = applyVinStructuredReviewAction(attrs, {
        type: "confirm",
        value: phrase,
        reviewId: attrs.vinReviewId ?? "",
      });
      assert.equal(result.outcome, "invalid_value", `"${phrase}" must never confirm`);
      assert.equal(result.attrs.vin, undefined);
    }
  });

  it("an exact VIN typed into chat text is only ever a candidate signal — never a confirmation", () => {
    // Re-applying the same text-extracted VIN is idempotent (candidate unchanged),
    // not a promotion.
    const first = applyVinExtractionCandidate({}, extraction(VALID_A, "unknown", 0.5));
    const again = applyVinExtractionCandidate(first, extraction(VALID_A, "unknown", 0.5));
    assert.equal(again.vin, undefined);
    assert.equal(deriveVinReviewState(again).status, "candidate");
  });

  it("plain quick-reply labels carry no value and no reviewId — they cannot be structured confirms", () => {
    const attrs = withCandidate(VALID_A);
    const chips = buildVinReviewDisplayChips(attrs);
    assert.ok(chips);
    assert.ok(!chips!.some((c) => c.includes(VALID_A)), "chips must not embed VIN values");
    for (const chip of chips!) {
      const result = applyVinStructuredReviewAction(attrs, {
        type: "confirm",
        value: chip,
        reviewId: attrs.vinReviewId ?? "",
      });
      assert.equal(result.outcome, "invalid_value");
    }
  });
});

describe("Phase 2C — REQUIRED 12: correction requires its own fresh confirmation", () => {
  it("correctVin replaces the candidate with a FRESH generation but does not confirm", () => {
    const attrs = withCandidate(VALID_A);
    const corrected = correctVin(attrs, {
      type: "correct",
      value: VALID_B,
      reviewId: attrs.vinReviewId ?? "",
    });
    assert.equal(corrected.outcome, "applied");
    assert.equal(corrected.attrs.vin, undefined);
    assert.equal(corrected.attrs.vinCandidate, VALID_B);
    assert.equal(corrected.attrs.vinCandidateSource, "user_entered");
    assert.notEqual(corrected.attrs.vinReviewId, attrs.vinReviewId, "correction mints a fresh generation");
    assert.equal(deriveVinReviewState(corrected.attrs).status, "candidate");
  });

  it("confirming the corrected value (not the original) becomes canonical", () => {
    const attrs = withCandidate(VALID_A);
    const corrected = correctVin(attrs, {
      type: "correct",
      value: VALID_B,
      reviewId: attrs.vinReviewId ?? "",
    }).attrs;
    const confirmed = confirmVin(corrected, {
      type: "confirm",
      value: VALID_B,
      reviewId: corrected.vinReviewId ?? "",
    });
    assert.equal(confirmed.outcome, "applied");
    assert.equal(confirmed.attrs.vin, VALID_B);
  });

  it("correcting with a stale (pre-correction) reviewId is a safe no-op", () => {
    const attrs = withCandidate(VALID_A);
    const staleId = attrs.vinReviewId ?? "";
    const corrected = correctVin(attrs, {
      type: "correct",
      value: VALID_B,
      reviewId: staleId,
    }).attrs;
    const staleCorrect = correctVin(corrected, {
      type: "correct",
      value: VALID_C,
      reviewId: staleId,
    });
    assert.equal(staleCorrect.outcome, "stale_review");
    assert.equal(staleCorrect.attrs.vinCandidate, VALID_B, "stale correction must not clobber the newer candidate");
  });
});

describe("Phase 2C — REQUIRED 13/14/15/16: stale actions are generation-bound no-ops", () => {
  it("stale confirm cannot alter the current state (A displayed, replaced by B)", () => {
    const attrs = withCandidate(VALID_A);
    const staleId = attrs.vinReviewId ?? "";
    const corrected = correctVin(attrs, {
      type: "correct",
      value: VALID_B,
      reviewId: staleId,
    }).attrs;
    const staleConfirm = confirmVin(corrected, {
      type: "confirm",
      value: VALID_A,
      reviewId: staleId,
    });
    assert.equal(staleConfirm.outcome, "stale_review");
    assert.equal(staleConfirm.attrs.vin, undefined);
    assert.equal(staleConfirm.attrs.vinCandidate, VALID_B, "stale confirm bound to A must not confirm B");
  });

  it("stale reject cannot alter the current state", () => {
    const attrs = withCandidate(VALID_A);
    const staleId = attrs.vinReviewId ?? "";
    const corrected = correctVin(attrs, {
      type: "correct",
      value: VALID_B,
      reviewId: staleId,
    }).attrs;
    const staleReject = rejectVin(corrected, { type: "reject", reviewId: staleId });
    assert.equal(staleReject.outcome, "stale_review");
    assert.equal(staleReject.attrs.vinCandidate, VALID_B);
  });

  it("A→B→A: identical VIN text re-appearing with a new generation never matches by value alone", () => {
    const attrs = withCandidate(VALID_A);
    const originalId = attrs.vinReviewId ?? "";
    // B replaces A (new generation).
    const corrected = correctVin(attrs, {
      type: "correct",
      value: VALID_B,
      reviewId: originalId,
    }).attrs;
    // The human tries to confirm A using A's OLD generation while B is current.
    const staleByValue = confirmVin(corrected, {
      type: "confirm",
      value: VALID_A,
      reviewId: originalId,
    });
    assert.equal(staleByValue.outcome, "stale_review", "matching VIN text alone is never sufficient");
    assert.equal(staleByValue.attrs.vinCandidate, VALID_B);
  });

  it("a confirm carrying a reviewId from a different session/draft cannot confirm this draft's candidate", () => {
    const attrs = withCandidate(VALID_A);
    const foreign = withCandidate(VALID_A);
    const result = confirmVin(attrs, {
      type: "confirm",
      value: VALID_A,
      reviewId: foreign.vinReviewId ?? "",
    });
    assert.equal(result.outcome, "stale_review");
    assert.equal(result.attrs.vin, undefined);
  });
});

describe("Phase 2C — REQUIRED 17: photo/document disagreement => conflict, no silent winner", () => {
  it("two disagreeing sources become visible choices; neither silently overwrites the other", () => {
    const fromPhoto = applyVinExtractionCandidate({}, extraction(VALID_A, "photo_ocr", 0.7));
    const withDocument = applyVinExtractionCandidate(fromPhoto, extraction(VALID_B, "document_ocr", 0.8));
    const state = deriveVinReviewState(withDocument);
    assert.equal(state.status, "conflict");
    assert.equal(state.candidate, VALID_A);
    assert.equal(state.candidateSource, "photo_ocr");
    assert.equal(state.conflictValue, VALID_B);
    assert.equal(state.conflictSource, "document_ocr");
    assert.equal(withDocument.vin, undefined);
  });

  it("a third disagreeing value never perturbs a pending conflict (never picks a winner)", () => {
    const a = applyVinExtractionCandidate({}, extraction(VALID_A, "photo_ocr", 0.7));
    const conflicted = applyVinExtractionCandidate(a, extraction(VALID_B, "document_ocr", 0.7));
    const stillConflicted = applyVinExtractionCandidate(conflicted, extraction(VALID_C, "unknown", 0.9));
    assert.deepEqual(stillConflicted, conflicted);
  });

  it("resolving a conflict requires an explicit confirm of the chosen value", () => {
    const a = applyVinExtractionCandidate({}, extraction(VALID_A, "photo_ocr", 0.7));
    const conflicted = applyVinExtractionCandidate(a, extraction(VALID_B, "document_ocr", 0.7));
    const resolved = confirmVin(conflicted, {
      type: "confirm",
      value: VALID_B,
      reviewId: conflicted.vinReviewId ?? "",
    });
    assert.equal(resolved.outcome, "applied");
    assert.equal(resolved.attrs.vin, VALID_B);
    assert.equal(deriveVinReviewState(resolved.attrs).status, "confirmed");
  });

  it("a confirmed canonical VIN survives a disagreeing rescan (conflict opened, canonical preserved)", () => {
    const base = withCandidate(VALID_A);
    const confirmed = confirmVin(base, {
      type: "confirm",
      value: VALID_A,
      reviewId: base.vinReviewId ?? "",
    }).attrs;
    const rescanned = applyVinExtractionCandidate(confirmed, extraction(VALID_B, "photo_ocr", 0.95));
    assert.equal(rescanned.vin, VALID_A, "confirmed value must survive a disagreeing rescan untouched");
    assert.equal(deriveVinReviewState(rescanned).status, "conflict");
    assert.equal(rescanned.vinConflictValue, VALID_B);
  });

  it("rejecting a challenger preserves the prior confirmed value", () => {
    const base = withCandidate(VALID_A);
    const confirmed = confirmVin(base, {
      type: "confirm",
      value: VALID_A,
      reviewId: base.vinReviewId ?? "",
    }).attrs;
    const rescanned = applyVinExtractionCandidate(confirmed, extraction(VALID_B, "photo_ocr", 0.6));
    const rejected = rejectVin(rescanned, {
      type: "reject",
      reviewId: rescanned.vinReviewId ?? "",
    });
    assert.equal(rejected.outcome, "rejected");
    assert.equal(rejected.attrs.vin, VALID_A);
    assert.equal(deriveVinReviewState(rejected.attrs).status, "confirmed");
  });

  it("rejecting a first-ever candidate leaves canonical absent", () => {
    const attrs = withCandidate(VALID_A);
    const rejected = rejectVin(attrs, {
      type: "reject",
      reviewId: attrs.vinReviewId ?? "",
    });
    assert.equal(rejected.outcome, "rejected");
    assert.equal(rejected.attrs.vin, undefined);
    assert.equal(deriveVinReviewState(rejected.attrs).status, "absent");
  });
});

describe("Phase 2C — REQUIRED 18: typed outcomes drive replies (false/no-op never claims success)", () => {
  it("confirm on absent state => not_found", () => {
    const result = confirmVin({}, { type: "confirm", value: VALID_A, reviewId: "vr_x" });
    assert.equal(result.outcome, "not_found");
  });

  it("confirm with a wrong value => invalid_value", () => {
    const attrs = withCandidate(VALID_A);
    const result = confirmVin(attrs, {
      type: "confirm",
      value: VALID_C,
      reviewId: attrs.vinReviewId ?? "",
    });
    assert.equal(result.outcome, "invalid_value");
  });

  it("reject with a stale reviewId => stale_review (never rejected)", () => {
    const attrs = withCandidate(VALID_A);
    const result = rejectVin(attrs, { type: "reject", reviewId: "vr_old" });
    assert.equal(result.outcome, "stale_review");
    assert.equal(result.attrs.vinCandidate, VALID_A);
  });

  it("correct with an implausible value => invalid_value (no change)", () => {
    const attrs = withCandidate(VALID_A);
    const result = correctVin(attrs, {
      type: "correct",
      value: "NOPE",
      reviewId: attrs.vinReviewId ?? "",
    });
    assert.equal(result.outcome, "invalid_value");
    assert.equal(result.attrs.vinCandidate, VALID_A);
  });

  it("correct on absent state => not_found", () => {
    const result = correctVin({}, { type: "correct", value: VALID_A, reviewId: "vr_x" });
    assert.equal(result.outcome, "not_found");
  });
});

describe("Phase 2C — REQUIRED 19/20: untrusted markers are stripped; vision cannot fabricate authority", () => {
  it("LLM-supplied vinConfirmed and every authority marker are stripped from untrusted maps", () => {
    const malicious = {
      make: "BMW",
      vin: VALID_A,
      vinConfirmed: "true",
      vinConfirmedSource: "user_entered",
      vinConfirmedReviewId: "vr_forged",
      vinCandidate: VALID_A,
      vinCandidateSource: "photo_ocr",
      vinCandidateConfidence: "1",
      vinConflict: "true",
      vinConflictValue: VALID_B,
      vinConflictSource: "unknown",
      vinUncertain: "true",
      vinReviewId: "vr_forged",
      vinReviewState: "pending_human_review",
      year: "2015",
    };
    const stripped = stripUntrustedVinMarkers(malicious);
    assert.deepEqual(stripped, { make: "BMW", year: "2015" });
  });

  it("vision JSON containing authority markers cannot fabricate a confirmed VIN via the merge path", () => {
    // What the model may emit:
    const visionPayload = {
      vin: VALID_B,
      vinConfirmed: "true",
      vinConfirmedReviewId: "vr_hallucinated",
      vinConflict: "true",
      vinConflictValue: VALID_C,
      color: "Juoda",
    };
    const stripped = stripUntrustedVinMarkers(visionPayload) as Record<string, string>;
    assert.equal(stripped.vin, undefined);
    assert.equal(stripped.vinConfirmed, undefined);
    assert.equal(stripped.color, "Juoda");
    // The surviving bare value can only re-enter as a candidate:
    const merged = applyVinExtractionCandidate(
      { vin: VALID_A, vinConfirmed: "true", vinConfirmedSource: "user_entered", vinConfirmedReviewId: "vr_real" },
      { value: visionPayload.vin, source: "photo_ocr" }
    );
    assert.equal(merged.vin, VALID_A, "confirmed canonical survives a hallucinated challenger");
    assert.equal(deriveVinReviewState(merged).status, "conflict");
    assert.equal(merged.vinConfirmedReviewId, "vr_real", "hallucinated confirmation generation never leaks through");
  });
});

describe("Phase 2C — REQUIRED 21/22: model-visible vs trusted side-effect separation", () => {
  it("model projection contains no VIN value, no reviewId, no provenance — only a generic flag", () => {
    const attrs = withCandidate(VALID_A);
    const model = redactVinReviewForModel(attrs);
    assert.equal(model.vin, undefined);
    assert.equal(model.vinCandidate, undefined);
    assert.equal(model.vinReviewId, undefined);
    assert.equal(model.vinConfirmed, undefined);
    assert.equal(model.vinReviewState, "pending_human_review");
  });

  it("the trusted side-effect carries the exact candidate + provenance + reviewId", () => {
    const attrs = withCandidate(VALID_A);
    const payload = buildVinReviewSideEffect(attrs);
    assert.ok(payload);
    assert.equal(payload!.type, "vin_review");
    assert.equal(payload!.reviewId, attrs.vinReviewId);
    assert.equal(payload!.candidate, VALID_A);
    assert.equal(payload!.candidateSource, "photo_ocr");
    assert.equal(payload!.choices.length, 1);
    assert.equal(payload!.choices[0]!.value, VALID_A);
  });

  it("the side-effect disappears once the review is resolved", () => {
    const attrs = withCandidate(VALID_A);
    const confirmed = confirmVin(attrs, {
      type: "confirm",
      value: VALID_A,
      reviewId: attrs.vinReviewId ?? "",
    }).attrs;
    assert.equal(buildVinReviewSideEffect(confirmed), null);
  });

  it("model projection of a confirmed draft carries no VIN at all", () => {
    const attrs = withCandidate(VALID_A);
    const confirmed = confirmVin(attrs, {
      type: "confirm",
      value: VALID_A,
      reviewId: attrs.vinReviewId ?? "",
    }).attrs;
    const model = redactVinReviewForModel(confirmed);
    assert.equal(model.vin, undefined, "even a confirmed VIN is redacted from model-visible results");
    assert.equal(model.vinReviewState, undefined);
  });
});

describe("Phase 2C — replay determinism", () => {
  it("re-applying the identical extraction twice never escalates to a conflict with itself", () => {
    const once = applyVinExtractionCandidate({}, extraction(VALID_A, "photo_ocr", 0.6));
    const twice = applyVinExtractionCandidate(once, extraction(VALID_A, "photo_ocr", 0.6));
    assert.equal(deriveVinReviewState(twice).status, "candidate");
    assert.equal(twice.vinConflict, undefined);
    assert.equal(twice.vinReviewId, once.vinReviewId, "same value keeps the current generation");
  });

  it("confirming the same candidate twice from the same snapshot yields the same canonical result", () => {
    const attrs = withCandidate(VALID_A);
    const action: VinReviewStructuredAction = {
      type: "confirm",
      value: VALID_A,
      reviewId: attrs.vinReviewId ?? "",
    };
    const once = applyVinStructuredReviewAction(attrs, action);
    const replay = applyVinStructuredReviewAction(attrs, action);
    assert.deepEqual(once.attrs, replay.attrs);
    assert.equal(once.attrs.vin, VALID_A);
    assert.equal(replay.attrs.vin, VALID_A);
  });
});
