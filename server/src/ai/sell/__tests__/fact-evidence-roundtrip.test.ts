/**
 * F2 CLOSURE — universal fact-evidence round-trip, human override semantics
 * and conflict persistence (7 verticals, category-neutral).
 *
 * The evidence chain survives draft serialization/reparse and the next
 * buildSellDraft round (priorFactEvidence): history grows, canonical values
 * and persisted conflicts stay active, human-confirmed values can never be
 * overwritten by AI/extractors, and conflicts resolve ONLY via explicit human
 * correction. Legacy drafts without evidence metadata keep working.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeFieldCandidates, type FieldCandidate } from "../field-merge.js";
import { buildSellDraft } from "../visual-sell-engine.js";
import { parseSellDraft, type SellDraft } from "../sell-draft-schema.js";
import { sellDraftToIntelDraft } from "../sell-to-intel.js";
import type { SellFieldSource } from "../sell-types.js";

function candidate<T>(
  value: T,
  source: SellFieldSource,
  confidence = 0.9,
  evidence?: string[]
): FieldCandidate<T> {
  return { value, source, confidence, evidence };
}

function roundTrip(draft: SellDraft): SellDraft {
  return parseSellDraft(JSON.parse(JSON.stringify(draft)) as Record<string, unknown>);
}

describe("F2 closure — round-trip continuity through the real engine path", () => {
  it("evidence survives JSON round-trip and the next buildSellDraft round", async () => {
    process.env.AI_MODEL_VISION = "foundation-vision-alias";
    process.env.AI_MODEL_FALLBACK = "foundation-fallback-alias";

    const first = await buildSellDraft({
      input: {
        text: "Parduodu BMW e46",
        imageUrls: ["https://cdn.example.com/car.jpg"],
      },
      visionExtractor: async () => ({ visualBrand: "Audi", confidence: 0.8 }),
      imageSafetyProvider: async () => ({ safe: true, reasons: [] }),
    });
    const firstBrand = first.factEvidence?.brand;
    assert.ok(firstBrand, "first round produces the brand projection");
    assert.ok(firstBrand.conflictWith, "first round conflict");

    const reparsed = roundTrip(first);
    const historyLen = reparsed.factEvidence?.brand?.state.history.length ?? 0;
    assert.ok(historyLen >= 2, "history survives serialization");

    const second = await buildSellDraft({
      input: {
        text: "Parduodu BMW e46",
        imageUrls: ["https://cdn.example.com/car.jpg"],
      },
      visionExtractor: async () => ({ visualBrand: "Audi", confidence: 0.8 }),
      imageSafetyProvider: async () => ({ safe: true, reasons: [] }),
      priorFactEvidence: reparsed.factEvidence,
    });
    const secondBrand = second.factEvidence?.brand;
    assert.ok(secondBrand, "second round keeps the projection");
    assert.equal(secondBrand.state.validity, "VALID");
    assert.equal(secondBrand.state.canonical?.value, "bmw", "canonical preserved");
    assert.ok(
      (secondBrand.state.history.length ?? 0) >= historyLen,
      "cumulative history grows, never shrinks"
    );
    assert.ok(secondBrand.conflictWith, "persisted conflict stays attached");
    assert.equal(secondBrand.reviewRequired, true);
    assert.equal(second.brand?.requiresConfirmation, true);

    const intel = sellDraftToIntelDraft(second);
    assert.ok(intel.fields.brand!.conflicts.length >= 1, "conflict visible in intel layer");
    assert.equal(intel.fields.brand!.reviewState, "NEEDS_REVIEW");
  });
});

describe("F2 closure — human authority (override protection, no escalation)", () => {
  it("AI/extractor evidence can never overwrite a human-confirmed canonical", () => {
    const humanConfirmed = mergeFieldCandidates("brand", [
      candidate("BMW", "USER_PROVIDED", 0.95),
    ]);
    assert.equal(
      humanConfirmed.factEvidence?.state.canonical?.status,
      "HUMAN_CONFIRMED"
    );

    const prior = humanConfirmed.factEvidence!;
    const roundTripPrior = parseSellDraft({
      category: { value: "vehicles", confidence: 0.9, source: "TEXT", requiresConfirmation: false },
      title: { value: "BMW", confidence: 0.9, source: "TEXT", requiresConfirmation: false },
      attributes: {},
      missing: ["price"],
      warnings: [],
      requiresUserConfirmation: true,
      autoPublish: false,
      foundationVersion: "F2",
      factEvidence: { brand: prior },
    }).factEvidence!.brand!;

    const attacked = mergeFieldCandidates(
      "brand",
      [candidate("Audi", "VISION", 0.99)],
      { existingFactEvidence: roundTripPrior }
    );
    const state = attacked.factEvidence!.state;
    assert.equal(state.validity, "VALID");
    assert.equal(state.canonical?.value, "bmw", "human value NOT overwritten");
    assert.ok(attacked.factEvidence!.conflictWith, "conflict persists");
    assert.equal(attacked.factEvidence!.reviewRequired, true);
    assert.notEqual(state.canonical?.status, "INDEPENDENTLY_VERIFIED");
    assert.notEqual(state.canonical?.source, "TRUSTED_VERIFICATION");
  });

  it("explicit human correction resolves the conflict legitimately", () => {
    const conflicted = mergeFieldCandidates("brand", [
      candidate("BMW", "TEXT", 0.9),
      candidate("Audi", "VISION", 0.8),
    ]);
    assert.equal(conflicted.conflict, true);

    const corrected = mergeFieldCandidates(
      "brand",
      [candidate("Audi", "USER_PROVIDED", 0.95)],
      {
        existingFactEvidence: conflicted.factEvidence,
        isUserCorrection: true,
      }
    );
    const state = corrected.factEvidence!.state;
    assert.equal(state.validity, "VALID");
    assert.equal(state.canonical?.value, "audi", "correction becomes canonical");
    assert.equal(state.canonical?.status, "HUMAN_CONFIRMED");
    assert.equal(corrected.factEvidence!.conflictWith, undefined, "conflict resolved");
    assert.equal(corrected.conflict, false);
    assert.notEqual(state.canonical?.source, "TRUSTED_VERIFICATION");
  });

  it("non-correction re-merge with the same winning value keeps the conflict active", () => {
    const conflicted = mergeFieldCandidates("attributes.mileage", [
      candidate("120000", "TEXT", 0.9),
      candidate("95000", "VISION", 0.8),
    ]);
    const again = mergeFieldCandidates(
      "attributes.mileage",
      [candidate("120000", "TEXT", 0.9)],
      { existingFactEvidence: conflicted.factEvidence }
    );
    assert.equal(again.conflict, true, "conflict persists without human action");
    assert.ok(again.factEvidence!.conflictWith, "competing evidence retained");
    assert.equal(again.field.requiresConfirmation, true);
  });
});

describe("F2 closure — 7-vertical parity for round-trip + conflict persistence", () => {
  const VERTICALS = [
    { vertical: "transportas", key: "attributes.mileage", a: "120000", b: "95000" },
    { vertical: "NT", key: "attributes.area", a: "62", b: "75" },
    { vertical: "elektronika", key: "attributes.storageGb", a: 128, b: 256 },
    { vertical: "drabužiai", key: "attributes.size", a: "M", b: "L" },
    { vertical: "prekės", key: "title", a: "Sofa kampinė", b: "Lova dvigulė" },
    { vertical: "paslaugos", key: "attributes.workType", a: "santechnika", b: "elektra" },
    { vertical: "darbai", key: "attributes.salary", a: 2000, b: 2500 },
  ] as const;

  for (const v of VERTICALS) {
    it(`${v.vertical}: canonical survives the round-trip, conflict persists`, () => {
      const first = mergeFieldCandidates(
        v.key,
        [
          candidate(v.a as never, "TEXT", 0.9),
          candidate(v.b as never, "VISION", 0.8),
        ] as Array<FieldCandidate<string | number>>
      );
      assert.equal(first.conflict, true);

      const reparsed = roundTrip(
        parseSellDraft({
          category: { value: "other", confidence: 0.9, source: "TEXT", requiresConfirmation: false },
          title: { value: "x", confidence: 0.9, source: "TEXT", requiresConfirmation: false },
          attributes: {},
          missing: ["price"],
          warnings: [],
          requiresUserConfirmation: true,
          autoPublish: false,
          foundationVersion: "F2",
          factEvidence: { [v.key]: first.factEvidence },
        })
      );

      const second = mergeFieldCandidates(
        v.key,
        [candidate(v.a as never, "TEXT", 0.9)] as Array<FieldCandidate<string | number>>,
        { existingFactEvidence: reparsed.factEvidence?.[v.key] }
      );
      assert.equal(second.factEvidence!.state.validity, "VALID");
      assert.equal(
        second.factEvidence!.state.canonical?.value,
        first.factEvidence!.state.canonical?.value,
        "canonical preserved"
      );
      assert.ok(second.factEvidence!.conflictWith, "conflict persists");
      assert.equal(second.field.requiresConfirmation, true);

      const corrected = mergeFieldCandidates(
        v.key,
        [candidate(v.b as never, "USER_PROVIDED", 0.95)] as Array<FieldCandidate<string | number>>,
        { existingFactEvidence: second.factEvidence, isUserCorrection: true }
      );
      assert.equal(
        corrected.factEvidence!.state.canonical?.status,
        "HUMAN_CONFIRMED"
      );
      assert.equal(corrected.factEvidence!.conflictWith, undefined);
    });
  }
});

describe("F2 closure — legacy compatibility and context protection", () => {
  it("drafts without prior evidence metadata keep working unchanged", async () => {
    const draft = await buildSellDraft({
      input: { text: "Parduodu dviratį už 200 €" },
    });
    assert.equal(draft.requiresUserConfirmation, true);
    const reparsed = roundTrip(draft);
    const second = await buildSellDraft({
      input: { text: "Parduodu dviratį už 200 €" },
      priorFactEvidence: reparsed.factEvidence, // undefined → fresh chain
    });
    assert.equal(second.price?.value, 200);
  });

  it("structured evidence never reaches the model-visible slice (context protection)", async () => {
    process.env.AI_MODEL_VISION = "foundation-vision-alias";
    process.env.AI_MODEL_FALLBACK = "foundation-fallback-alias";
    const { slimListingDraftForLlm } = await import("../../../shared/llm-context-slice.js");

    const draft = await buildSellDraft({
      input: {
        text: "Parduodu BMW e46",
        imageUrls: ["https://cdn.example.com/car.jpg"],
      },
      visionExtractor: async () => ({ visualBrand: "Audi", confidence: 0.8 }),
      imageSafetyProvider: async () => ({ safe: true, reasons: [] }),
    });
    const slim = slimListingDraftForLlm(draft as unknown as Record<string, unknown>);
    const json = JSON.stringify(slim);
    assert.ok(!json.includes("factEvidence"));
    assert.ok(!json.includes("conflictWith"));
    assert.ok(!json.includes("TRUSTED_VERIFICATION"));
  });
});
