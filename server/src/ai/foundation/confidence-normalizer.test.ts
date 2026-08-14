import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyConfidencePolicy,
  classifyConfidenceTier,
} from "./confidence.js";
import {
  isVatInvoiceCue,
  normalizeAutomotiveText,
  normalizeLithuanianDomainText,
} from "./domain-normalizer/index.js";
import { resolveComparableExpansion } from "./comparable-policy.js";
import { computeAiQualityMetrics } from "./quality.js";

describe("AI foundation confidence policy", () => {
  it("maps HIGH / MEDIUM / ABSTAIN thresholds", () => {
    assert.equal(classifyConfidenceTier(0.9), "HIGH");
    assert.equal(classifyConfidenceTier(0.89), "MEDIUM");
    assert.equal(classifyConfidenceTier(0.7), "MEDIUM");
    assert.equal(classifyConfidenceTier(0.69), "ABSTAIN");

    const high = applyConfidencePolicy({ price: 100 }, 0.95);
    assert.equal(high.tier, "HIGH");
    assert.equal(high.abstained, false);
    assert.deepEqual(high.value, { price: 100 });
    assert.equal(high.requiresUserConfirmation, false);

    const mid = applyConfidencePolicy({ price: 100 }, 0.8);
    assert.equal(mid.tier, "MEDIUM");
    assert.equal(mid.requiresUserConfirmation, true);
    assert.equal(mid.abstained, false);

    const low = applyConfidencePolicy({ price: 100 }, 0.5);
    assert.equal(low.tier, "ABSTAIN");
    assert.equal(low.abstained, true);
    assert.equal(low.value, null);
  });
});

describe("AI foundation LT domain normalizer", () => {
  it("maps automotive slang to structured attributes and keeps originalText", () => {
    const r = normalizeAutomotiveText(
      "Parduodu, automatas, dyzelis, quattro, xDrive"
    );
    assert.equal(r.originalText.includes("dyzelis"), true);

    const byKind = Object.fromEntries(
      r.attributes.map((a) => [a.kind + ":" + ("context" in a ? a.context : ""), a])
    );

    assert.ok(
      r.attributes.some(
        (a) => a.kind === "transmission" && a.value === "automatic"
      )
    );
    assert.ok(
      r.attributes.some((a) => a.kind === "fuel" && a.value === "diesel")
    );
    assert.ok(
      r.attributes.some(
        (a) =>
          a.kind === "drivetrain" &&
          a.value === "AWD" &&
          a.context === "Audi"
      )
    );
    assert.ok(
      r.attributes.some(
        (a) =>
          a.kind === "drivetrain" &&
          a.value === "AWD" &&
          a.context === "BMW"
      )
    );
    void byKind;

    const manual = normalizeAutomotiveText("mechanas / mechaninė, benzas, elektra");
    assert.ok(
      manual.attributes.some(
        (a) => a.kind === "transmission" && a.value === "manual"
      )
    );
    assert.ok(
      manual.attributes.some((a) => a.kind === "fuel" && a.value === "petrol")
    );
    assert.ok(
      manual.attributes.some((a) => a.kind === "fuel" && a.value === "electric")
    );
  });

  it("treats PVM sąskaita as commerce, not automotive tech", () => {
    assert.equal(isVatInvoiceCue("Reikia PVM sąskaitos"), true);
    const r = normalizeLithuanianDomainText(
      "Parduodu su PVM sąskaita, automatas"
    );
    assert.ok(
      r.attributes.some(
        (a) => a.kind === "commerce" && a.value === "vat_invoice"
      )
    );
    assert.ok(
      r.attributes.some(
        (a) => a.kind === "transmission" && a.value === "automatic"
      )
    );
    assert.ok(!r.attributes.some((a) => a.kind === "unknown"));
  });
});

describe("AI foundation comparable + quality helpers", () => {
  it("returns INSUFFICIENT_DATA instead of inventing numbers", () => {
    const r = resolveComparableExpansion({
      baseConfidence: 0.9,
      samplesByLevel: { LOCAL_STRICT: 1, LOCAL_RELAXED: 2 },
      minSamples: 3,
    });
    assert.equal(r.level, "INSUFFICIENT_DATA");
    assert.equal(r.insufficientData, true);
    assert.equal(r.confidence, null);
  });

  it("lowers confidence when expanding comparable set", () => {
    const r = resolveComparableExpansion({
      baseConfidence: 1,
      samplesByLevel: { LOCAL_STRICT: 0, CATEGORY_RELAXED: 5 },
      minSamples: 3,
    });
    assert.equal(r.level, "CATEGORY_RELAXED");
    assert.equal(r.insufficientData, false);
    assert.ok(r.confidence != null && r.confidence < 1);
  });

  it("computes quality rates and latency percentiles", () => {
    const m = computeAiQualityMetrics([
      {
        accurate: true,
        latencyMs: 100,
        fallbackUsed: false,
        abstained: false,
        userCorrected: false,
        estimatedCost: 0.01,
      },
      {
        accurate: false,
        latencyMs: 200,
        fallbackUsed: true,
        abstained: true,
        userCorrected: true,
        estimatedCost: 0.02,
      },
    ]);
    assert.equal(m.sampleCount, 2);
    assert.equal(m.accuracy, 0.5);
    assert.equal(m.fallbackRate, 0.5);
    assert.equal(m.abstentionRate, 0.5);
    assert.equal(m.userCorrectionRate, 0.5);
    assert.ok(m.latencyP50Ms != null);
  });
});
