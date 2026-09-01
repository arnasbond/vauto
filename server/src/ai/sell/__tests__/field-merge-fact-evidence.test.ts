/**
 * F2.1 — fact-evidence decision authority at the REAL per-field merge boundary
 * (`field-merge.ts`), which `buildSellDraft` and the Stage 10 `/sell/draft` route
 * both use. These are integration regression tests: they prove the candidate
 * values already normalized upstream are folded through `evaluateFieldEvidence`
 * in the existing precedence order, and that the decision result is the
 * authority for whether conflicting or unsupported evidence forces confirmation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeFieldCandidates, type FieldCandidate } from "../field-merge.js";
import { buildSellDraft } from "../visual-sell-engine.js";
import { evaluateFieldEvidence } from "../../../shared/fact-evidence-adapter.js";
import type { SellFieldSource } from "../sell-types.js";

function candidate<T>(
  value: T,
  source: SellFieldSource,
  confidence = 0.9,
  evidence?: string[]
): FieldCandidate<T> {
  return { value, source, confidence, evidence };
}

const ALL_SELL_SOURCES: SellFieldSource[] = [
  "USER_PROVIDED",
  "TEXT",
  "VOICE",
  "COMBINED",
  "VISION",
  "OCR_UNTRUSTED",
];

describe("F2.1 — fact-evidence decision authority at the merge boundary", () => {
  it("the production buildSellDraft path invokes fact-evidence semantics (vision vs text conflict)", async () => {
    process.env.AI_MODEL_VISION = "foundation-vision-alias";
    process.env.AI_MODEL_FALLBACK = "foundation-fallback-alias";

    const draft = await buildSellDraft({
      input: {
        text: "Parduodu BMW e46",
        imageUrls: ["https://cdn.example.com/car.jpg"],
      },
      visionExtractor: async () => ({ visualBrand: "Audi", confidence: 0.8 }),
      imageSafetyProvider: async () => ({ safe: true, reasons: [] }),
    });

    assert.equal(draft.brand?.value, "BMW", "winning user value preserved");
    assert.equal(draft.brand?.requiresConfirmation, true);
    assert.ok(
      draft.brand?.evidence?.some((e) => e.startsWith("conflict:")),
      "fact-evidence conflict recorded as evidence"
    );
    assert.ok(draft.warnings.some((w) => /Konfliktas|conflict/i.test(w)));
    assert.equal(draft.autoPublish, false);
    assert.equal(draft.requiresUserConfirmation, true);
  });

  it("equivalent normalized string values do not conflict", () => {
    const r = mergeFieldCandidates("brand", [
      candidate("BMW", "TEXT", 0.9),
      candidate("  bMw  ", "VISION", 0.8),
    ]);
    assert.equal(r.conflict, false);
    assert.equal(r.field.value, "BMW");
    assert.equal(
      r.field.evidence?.some((e) => e.startsWith("conflict:")) ?? false,
      false
    );
    assert.equal(r.warning, undefined);
  });

  it("differing user/document-or-visual credible values conflict with the winning value preserved", () => {
    const r = mergeFieldCandidates("brand", [
      candidate("BMW", "TEXT", 0.9),
      candidate("Audi", "VISION", 0.8),
    ]);
    assert.equal(r.conflict, true);
    assert.equal(r.field.value, "BMW", "winning value preserved");
    assert.equal(r.field.requiresConfirmation, true);
    assert.ok(r.field.evidence?.some((e) => e.startsWith("conflict:")));
    assert.match(r.warning ?? "", /BMW.*Audi/);
  });

  it("model/unknown evidence cannot silently establish authority", () => {
    const alone = mergeFieldCandidates("brand", [
      candidate("BMW", "COMBINED", 0.95),
    ]);
    assert.equal(
      alone.field.requiresConfirmation,
      true,
      "model inference alone cannot establish authority without confirmation"
    );

    const challenger = mergeFieldCandidates("brand", [
      candidate("BMW", "TEXT", 0.9),
      candidate("Audi", "COMBINED", 0.95),
    ]);
    assert.equal(
      challenger.field.value,
      "BMW",
      "inference cannot overwrite the credible winning value"
    );
    assert.equal(challenger.field.requiresConfirmation, true);
    assert.equal(challenger.conflict, false);
  });

  it("no source can mint trusted verification through the merge seam", () => {
    for (const source of ALL_SELL_SOURCES) {
      const r = mergeFieldCandidates("brand", [
        candidate("BMW", source, 0.9),
      ]);
      // ExtractedField.source stays a SellFieldSource — never a fact-evidence
      // source such as TRUSTED_VERIFICATION.
      assert.ok(
        ALL_SELL_SOURCES.includes(r.field.source),
        `${source} → ${r.field.source}`
      );
      assert.notEqual(r.field.source, "TRUSTED_VERIFICATION");
    }

    // The exact seam the merge uses: every sell source maps to a NON-trusted
    // fact-evidence source, so no candidate can ever become independently
    // verified and gain silent authority.
    for (const source of ALL_SELL_SOURCES) {
      const decision = evaluateFieldEvidence(null, candidate("BMW", source, 0.9));
      if (decision) {
        assert.notEqual(
          decision.state.canonical?.status,
          "INDEPENDENTLY_VERIFIED",
          source
        );
        assert.notEqual(
          decision.state.canonical?.source,
          "TRUSTED_VERIFICATION",
          source
        );
      }
    }
  });
});
