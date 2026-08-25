import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalDraftFromListing,
  buildDraftReviewHints,
  summarizeCanonicalDraft,
} from "@/lib/pre-publish-review";
import type { AiExtractedListing } from "@/lib/types";
import type { PrePublishReadiness } from "@/lib/pre-publish-validation";
import {
  applyHumanValue,
  createIntelField,
  draftNeedsReview,
  mergeAiSuggestion,
} from "@vauto/shared/listing-intelligence";

function baseDraft(overrides: Partial<AiExtractedListing> = {}): AiExtractedListing {
  return {
    title: "MacBook Pro M3 Max",
    price: 2400,
    location: "Vilnius",
    contact: "+37060000000",
    category: "electronics",
    confidence: 0.95,
    ...overrides,
  };
}

function readyReadiness(overrides: Partial<PrePublishReadiness> = {}): PrePublishReadiness {
  return {
    ok: true,
    missingPhoto: false,
    missingPhone: false,
    missingCity: false,
    missingPrice: false,
    missingAuth: false,
    blockMessage: "",
    quickReplies: [],
    syncedDraft: null,
    resolvedPhone: "+37060000000",
    resolvedCity: "Vilnius",
    hasPhoto: true,
    ...overrides,
  };
}

test("no hints for a clean high-confidence draft", () => {
  const hints = buildDraftReviewHints(baseDraft(), readyReadiness());
  assert.deepEqual(hints, []);
});

test("requiresReview surfaces the review notice", () => {
  const hints = buildDraftReviewHints(
    baseDraft({ requiresReview: true, reviewNotice: "Patikrinkite metus" }),
    readyReadiness()
  );
  assert.ok(hints.some((h) => h.id === "requires-review"));
  assert.ok(hints.some((h) => h.text.includes("Patikrinkite metus")));
});

test("requiresReview falls back to a generic notice when no notice text", () => {
  const hints = buildDraftReviewHints(
    baseDraft({ requiresReview: true, reviewNotice: "" }),
    readyReadiness()
  );
  const hint = hints.find((h) => h.id === "requires-review");
  assert.ok(hint, "requires-review hint present");
  assert.ok(hint.text.includes("patikrinti"));
});

test("low confidence below threshold surfaces a hint", () => {
  const hints = buildDraftReviewHints(
    baseDraft({ confidence: 0.6 }),
    readyReadiness()
  );
  assert.ok(hints.some((h) => h.id === "low-confidence"));
});

test("high confidence does not surface a low-confidence hint", () => {
  const hints = buildDraftReviewHints(
    baseDraft({ confidence: 0.9 }),
    readyReadiness()
  );
  assert.ok(!hints.some((h) => h.id === "low-confidence"));
});

test("document evidence surfaces a document-specs hint", () => {
  const hints = buildDraftReviewHints(
    baseDraft({
      attributes: { documentImageUrls: ["https://cdn.example/doc-registration.jpg"] },
    }),
    readyReadiness()
  );
  assert.ok(hints.some((h) => h.id === "document-specs"));
});

test("missing photo (photoless-allowed category) surfaces a no-photo hint", () => {
  const hints = buildDraftReviewHints(
    baseDraft({ category: "services" }),
    readyReadiness({ missingPhoto: true, hasPhoto: false })
  );
  assert.ok(hints.some((h) => h.id === "no-photo"));
});

test("hints never gate publish (purely informational contract)", () => {
  const hints = buildDraftReviewHints(
    baseDraft({ requiresReview: true, confidence: 0.4 }),
    readyReadiness({ missingPhoto: true })
  );
  assert.ok(hints.length >= 3);
  // Contract: review hints are advisory only — no field can carry a publish veto.
  for (const hint of hints) {
    assert.ok(!("blocking" in hint));
    assert.ok(typeof hint.id === "string" && hint.id.length > 0);
    assert.ok(typeof hint.text === "string" && hint.text.length > 0);
  }
});

/* -------------------------------------------------------------------------- */
/* Phase B — canonical draft consumption on the client review path             */
/* -------------------------------------------------------------------------- */

test("buildCanonicalDraftFromListing treats unknown-origin fields as advisory (AI_INFERRED)", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({ title: "MacBook Pro", price: 2400, location: "Vilnius" })
  );
  // Presence on an editable PrePublish surface is NOT human-authority evidence.
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.price!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.location!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.title!.provenance, "AI_INFERRED");
  assert.equal(canonical.fields.title!.confidence, 0.95);
});

test("buildCanonicalDraftFromListing never upgrades AI fields to human authority", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({ confidence: 0.99, description: "Puikūs metai" })
  );
  assert.equal(canonical.fields.description!.reviewState, "AI_SUGGESTED");
  assert.notEqual(canonical.fields.description!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.description!.provenance, "AI_INFERRED");
  // High confidence does not create human authority.
  assert.equal(canonical.fields.description!.confidence, 0.99);
  assert.equal(canonical.fields.description!.requiresReview, false);
});

test("buildCanonicalDraftFromListing surfaces document-derived attributes as DOCUMENT", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      attributes: {
        documentImageUrls: ["https://cdn.example/doc.jpg"],
        registrationYear: "2020",
      },
    })
  );
  const attr = canonical.fields["attributes.registrationYear"]!;
  assert.equal(attr.provenance, "DOCUMENT");
  assert.equal(attr.reviewState, "AI_SUGGESTED");
  assert.equal(attr.requiresReview, true);
});

test("buildCanonicalDraftFromListing normalizes invalid confidence to null", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({ confidence: 1.7, description: "x" })
  );
  assert.equal(canonical.fields.description!.confidence, null);
  assert.equal(canonical.fields.description!.requiresReview, true);
});

test("summarizeCanonicalDraft is advisory and never exposes publish authority", () => {
  const summary = summarizeCanonicalDraft(
    baseDraft({ confidence: 0.5, description: "Aprašymas" })
  );
  assert.ok(summary.fields.length > 0);
  assert.ok(!("publishAllowed" in summary));
  assert.ok(!("autoPublish" in summary));
  const desc = summary.fields.find((f) => f.fieldKey === "description")!;
  assert.equal(desc.state, "REVIEW");
});

test("summarizeCanonicalDraft returns empty summary for no draft", () => {
  const summary = summarizeCanonicalDraft(null);
  assert.deepEqual(summary, { fields: [], needsReview: false, hasConflicts: false });
});

/* -------------------------------------------------------------------------- */
/* Phase B REMEDIATION — provenance/authority + requiresReview invariant        */
/* -------------------------------------------------------------------------- */
/* B1: Human authority must originate ONLY from explicit human events/state.   */
/* Presence/visibility on an editable PrePublish surface is NOT evidence of    */
/* human authorship. Explicit user edit is recorded as a canonical marker      */
/* attribute (titleEditedByUser / priceEditedByUser / locationEditedByUser /   */
/* descriptionEditedByUser) by the real PrePublish transformation path.        */
/* -------------------------------------------------------------------------- */

// 1. AI-generated title displayed in PrePublish does NOT become HUMAN_CONFIRMED.
test("remediation: AI-generated title on PrePublish stays AI_SUGGESTED", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({ title: "MacBook Pro M3 Max", attributes: {} })
  );
  assert.equal(canonical.fields.title!.provenance, "AI_INFERRED");
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.notEqual(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
});

// 2. AI-generated price displayed in PrePublish does NOT become HUMAN_CONFIRMED.
test("remediation: AI-generated price on PrePublish stays AI_SUGGESTED", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({ price: 2400, attributes: {} })
  );
  assert.equal(canonical.fields.price!.provenance, "AI_INFERRED");
  assert.equal(canonical.fields.price!.reviewState, "AI_SUGGESTED");
  assert.notEqual(canonical.fields.price!.reviewState, "HUMAN_CONFIRMED");
});

// 3. AI-generated location displayed in PrePublish does NOT become HUMAN_CONFIRMED.
test("remediation: AI-generated location on PrePublish stays AI_SUGGESTED", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({ location: "Vilnius", attributes: {} })
  );
  assert.equal(canonical.fields.location!.provenance, "AI_INFERRED");
  assert.equal(canonical.fields.location!.reviewState, "AI_SUGGESTED");
  assert.notEqual(canonical.fields.location!.reviewState, "HUMAN_CONFIRMED");
});

// 4. Merely opening/rendering PrePublish cannot change provenance — a pure
//    transform of the same listing yields the identical canonical state.
test("remediation: rendering PrePublish is pure — provenance unchanged", () => {
  const listing = baseDraft({ title: "BMW 320d", price: 19000, location: "Kaunas" });
  const first = buildCanonicalDraftFromListing(listing);
  const second = buildCanonicalDraftFromListing(listing);
  assert.deepEqual(second, first);
  for (const key of ["title", "price", "location"] as const) {
    assert.equal(second.fields[key]!.reviewState, "AI_SUGGESTED");
    assert.equal(second.fields[key]!.provenance, "AI_INFERRED");
  }
});

// 5. Explicit user edit CAN create human authority — only via the canonical
//    marker recorded by the real PrePublish transformation path.
test("remediation: explicit user edit creates human authority via canonical marker", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      title: "Mano iPhone 15",
      attributes: { titleEditedByUser: "true" },
    })
  );
  assert.equal(canonical.fields.title!.provenance, "USER_ENTERED");
  assert.equal(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.title!.requiresReview, false);
});

// 6. Explicit user confirmation CAN create human authority only through the
//    canonical human-confirmation mechanism (applyHumanValue), and a
//    subsequent AI suggestion cannot overwrite it.
test("remediation: explicit confirmation via canonical mechanism survives AI suggestion", () => {
  const confirmed = applyHumanValue(
    createIntelField({ value: "2020", provenance: "AI_INFERRED", confidence: 0.99 }),
    "2020"
  );
  const merged = mergeAiSuggestion(
    "year",
    confirmed,
    createIntelField({ value: "2021", provenance: "VISION", confidence: 0.98 })
  );
  assert.equal(merged.field.value, "2020");
  assert.equal(merged.field.reviewState, "HUMAN_CONFIRMED");
  assert.equal(merged.conflictCreated, false);
});

// 7. confidence=1 from AI still does NOT imply HUMAN_CONFIRMED.
test("remediation: confidence=1 from AI does not imply human confirmation", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({ title: "AI Title", confidence: 1, attributes: {} })
  );
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.title!.provenance, "AI_INFERRED");
});

// 8. UNKNOWN provenance/confidence stays non-authoritative.
test("remediation: UNKNOWN provenance/confidence stays non-authoritative", () => {
  const listing = baseDraft({ title: "x", attributes: {} }) as AiExtractedListing;
  // AiExtractedListing types confidence as number, but the runtime contract
  // (and normalizeIntelConfidence) accepts null — cast expresses the honest
  // unknown state that the transform must tolerate.
  (listing as { confidence: number | null }).confidence = null;
  const canonical = buildCanonicalDraftFromListing(listing);
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.notEqual(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.title!.requiresReview, true);
});

// 9. DOCUMENT/VISION/AI_INFERRED never become HUMAN_CONFIRMED due to UI display.
test("remediation: DOCUMENT/VISION/AI_INFERRED never gain human authority by display", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      title: "Doc-derived",
      attributes: {
        documentImageUrls: ["https://cdn.example/doc.jpg"],
        registrationYear: "2020",
      },
    })
  );
  const docAttr = canonical.fields["attributes.registrationYear"]!;
  assert.equal(docAttr.provenance, "DOCUMENT");
  assert.equal(docAttr.reviewState, "AI_SUGGESTED");
  assert.equal(docAttr.requiresReview, true);

  // AI_INFERRED title with high confidence still not human-confirmed.
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
});

// 10. HUMAN_CONFIRMED survives later AI suggestion.
test("remediation: HUMAN_CONFIRMED survives later AI suggestion", () => {
  const confirmed = applyHumanValue(
    createIntelField({ value: "2400 €", provenance: "USER_ENTERED" }),
    "2400 €"
  );
  const merged = mergeAiSuggestion(
    "price",
    confirmed,
    createIntelField({ value: "1999 €", provenance: "AI_INFERRED", confidence: 0.99 })
  );
  assert.equal(merged.field.value, "2400 €");
  assert.equal(merged.field.reviewState, "HUMAN_CONFIRMED");
});

// 11. HUMAN_OVERRIDDEN survives later AI suggestion.
test("remediation: HUMAN_OVERRIDDEN survives later AI suggestion", () => {
  const overridden = applyHumanValue(
    createIntelField({ value: "2020", provenance: "AI_INFERRED", confidence: 0.9 }),
    "2019",
    { overridden: true }
  );
  const merged = mergeAiSuggestion(
    "year",
    overridden,
    createIntelField({ value: "2020", provenance: "VISION", confidence: 1 })
  );
  assert.equal(merged.field.value, "2019");
  assert.equal(merged.field.reviewState, "HUMAN_OVERRIDDEN");
});

/* -------------------------------------------------------------------------- */
/* B2 — draft-level requiresReview derived from canonical field state          */
/* (single Phase A policy via draftNeedsReview)                                */
/* -------------------------------------------------------------------------- */

// 12. draft.requiresReview is true whenever canonical field state requires review.
test("remediation: draft requiresReview reflects field state (AI low confidence)", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      title: "x",
      price: 100,
      confidence: 0.3,
      requiresReview: false,
      attributes: {},
    })
  );
  assert.equal(canonical.fields.title!.requiresReview, true);
  assert.equal(canonical.requiresReview, true);
});

test("remediation: draft requiresReview reflects UNKNOWN confidence", () => {
  const listing = baseDraft({ title: "x", attributes: {} }) as AiExtractedListing;
  // Runtime-valid unknown confidence (normalizeIntelConfidence accepts null).
  (listing as { confidence: number | null }).confidence = null;
  const canonical = buildCanonicalDraftFromListing(listing);
  assert.equal(canonical.fields.title!.requiresReview, true);
  assert.equal(canonical.requiresReview, true);
});

test("remediation: draft requiresReview reflects DOCUMENT provenance", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      attributes: {
        documentImageUrls: ["https://cdn.example/doc.jpg"],
        registrationYear: "2020",
      },
    })
  );
  assert.equal(canonical.fields["attributes.registrationYear"]!.requiresReview, true);
  assert.equal(canonical.requiresReview, true);
});

test("remediation: draft requiresReview reflects explicit conflict", () => {
  const withConflict = buildCanonicalDraftFromListing(
    baseDraft({ title: "x", location: "Vilnius", attributes: {} })
  );
  const merged = mergeAiSuggestion(
    "location",
    withConflict.fields.location!,
    createIntelField({ value: "Kaunas", provenance: "AI_INFERRED", confidence: 0.9 })
  );
  const draft = {
    fields: { ...withConflict.fields, location: merged.field },
    requiresReview: false,
    reviewReasons: [] as string[],
  };
  assert.ok(merged.conflictCreated);
  assert.equal(merged.field.requiresReview, true);
  assert.equal(merged.field.reviewState, "NEEDS_REVIEW");
  assert.equal(draftNeedsReview(draft), true);
});

// 13. No review required only when canonical policy actually permits it.
test("remediation: all fields genuinely HUMAN_CONFIRMED => no review required", () => {
  const listing = baseDraft({
    title: "Tikras pavadinimas",
    price: 2400,
    location: "Vilnius",
    attributes: {
      titleEditedByUser: "true",
      priceEditedByUser: "true",
      locationEditedByUser: "true",
    },
  });
  const canonical = buildCanonicalDraftFromListing(listing);
  assert.equal(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.price!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.location!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.title!.requiresReview, false);
  assert.equal(canonical.fields.price!.requiresReview, false);
  assert.equal(canonical.fields.location!.requiresReview, false);
  assert.equal(canonical.requiresReview, false);
});

test("remediation: explicit HUMAN_OVERRIDDEN field does not force review", () => {
  const overridden = applyHumanValue(
    createIntelField({ value: "2020", provenance: "AI_INFERRED", confidence: 0.7 }),
    "2019",
    { overridden: true }
  );
  const draft = {
    fields: { year: overridden },
    requiresReview: false,
    reviewReasons: [] as string[],
  };
  assert.equal(overridden.requiresReview, false);
  assert.equal(draftNeedsReview(draft), false);
});

test("remediation: mixed human + AI fields derive review from the AI fields", () => {
  const listing = baseDraft({
    title: "Žmogaus antraštė",
    price: 2400,
    location: "Vilnius",
    description: "AI sugeneruotas aprašymas",
    confidence: 0.4,
    attributes: {
      titleEditedByUser: "true",
      priceEditedByUser: "true",
      locationEditedByUser: "true",
    },
  });
  const canonical = buildCanonicalDraftFromListing(listing);
  assert.equal(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.description!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.description!.requiresReview, true);
  assert.equal(canonical.requiresReview, true);
});

// Explicit user edit of price/location also creates authority (marker path).
test("remediation: explicit price and location edits create human authority", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      price: 3100,
      location: "Klaipėda",
      attributes: {
        priceEditedByUser: "true",
        locationEditedByUser: "true",
      },
    })
  );
  assert.equal(canonical.fields.price!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.price!.provenance, "USER_ENTERED");
  assert.equal(canonical.fields.location!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.location!.provenance, "USER_ENTERED");
});
