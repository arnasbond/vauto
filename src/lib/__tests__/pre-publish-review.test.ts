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

// 5. Explicit user edit CAN create human authority — only through the TRUSTED
//    boundary: the typed `editedByUser` state set by the real PrePublish input
//    onChange handler (never via attributes).
test("remediation: explicit user edit creates human authority via trusted editedByUser", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      title: "Mano iPhone 15",
      editedByUser: { title: true },
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
    editedByUser: { title: true, price: true, location: true },
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
    editedByUser: { title: true, price: true, location: true },
  });
  const canonical = buildCanonicalDraftFromListing(listing);
  assert.equal(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.description!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.description!.requiresReview, true);
  assert.equal(canonical.requiresReview, true);
});

// Explicit user edit of price/location also creates authority (trusted path).
test("remediation: explicit price and location edits create human authority", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      price: 3100,
      location: "Klaipėda",
      editedByUser: { price: true, location: true },
    })
  );
  assert.equal(canonical.fields.price!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.price!.provenance, "USER_ENTERED");
  assert.equal(canonical.fields.location!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.location!.provenance, "USER_ENTERED");
});

/* -------------------------------------------------------------------------- */
/* B3 — TRUST BOUNDARY: edit markers are untrusted DATA, not authority         */
/* -------------------------------------------------------------------------- */
/* The legacy `*EditedByUser` attribute markers can arrive from untrusted AI / */
/* provider / document / import / hydration payloads. They must NEVER create   */
/* HUMAN_CONFIRMED / USER_ENTERED. Only the trusted typed `editedByUser`       */
/* state (set by real local input onChange handlers) proves human authorship.  */
/* -------------------------------------------------------------------------- */

// Negative spoofing: an AI/untrusted draft containing the exact marker string
// "true" must NOT obtain human authority.
test("B3 spoof: AI payload with titleEditedByUser='true' cannot forge human authority", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      title: "AI generated title",
      attributes: { titleEditedByUser: "true" },
    })
  );
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.title!.provenance, "AI_INFERRED");
  assert.notEqual(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
});

// Same negative spoof for price / location / description.
test("B3 spoof: price/location/description markers cannot forge human authority", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      price: 999,
      location: "Vilnius",
      description: "AI aprašymas",
      attributes: {
        priceEditedByUser: "true",
        locationEditedByUser: "true",
        descriptionEditedByUser: "true",
      },
    })
  );
  assert.equal(canonical.fields.price!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.price!.provenance, "AI_INFERRED");
  assert.equal(canonical.fields.location!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.location!.provenance, "AI_INFERRED");
  assert.equal(canonical.fields.description!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.description!.provenance, "AI_INFERRED");
});

// Legacy markers are stripped from the canonical attribute projection entirely.
test("B3: legacy edit-marker attributes are stripped from canonical attributes", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      attributes: {
        titleEditedByUser: "true",
        priceEditedByUser: "true",
        locationEditedByUser: "true",
        descriptionEditedByUser: "true",
        registrationYear: "2020",
      },
    })
  );
  assert.equal(canonical.fields["attributes.titleEditedByUser"], undefined);
  assert.equal(canonical.fields["attributes.priceEditedByUser"], undefined);
  assert.equal(canonical.fields["attributes.locationEditedByUser"], undefined);
  assert.equal(canonical.fields["attributes.descriptionEditedByUser"], undefined);
  // Real attributes survive.
  assert.ok(canonical.fields["attributes.registrationYear"]);
});

// DOCUMENT/VISION/AI_INFERRED/imported/hydrated values cannot forge evidence —
// markers carried alongside document content stay non-authoritative.
test("B3: document/VISION/hydrated values with markers cannot forge human authority", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      title: "Hydrated title",
      location: "Kaunas",
      attributes: {
        documentImageUrls: ["https://cdn.example/doc.jpg"],
        titleEditedByUser: "true",
        locationEditedByUser: "true",
      },
    })
  );
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.location!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.title!.provenance, "AI_INFERRED");
});

// Opening/rendering/rehydrating PrePublish cannot create human authority: a pure
// transform of a marker-bearing draft never produces HUMAN_CONFIRMED, and the
// marker does not survive the strip.
test("B3: rehydrating a marker-bearing draft cannot create human authority", () => {
  const rehydrated = baseDraft({
    title: "Pavadinimas iš localStorage",
    attributes: { titleEditedByUser: "true" },
  });
  const canonical = buildCanonicalDraftFromListing(rehydrated);
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.title!.provenance, "AI_INFERRED");
  const again = buildCanonicalDraftFromListing(rehydrated);
  assert.deepEqual(again, canonical);
});

// A real user onChange event still produces canonical human authority — through
// the trusted typed state, exactly as the modal now emits it.
test("B3: real user onChange (trusted editedByUser) produces human authority", () => {
  // This mirrors PrePublishModal's title onChange:
  //   patchField({ title: e.target.value, editedByUser: { title: true } })
  const modalPatch = { title: "Mano ranka įvesta antraštė", editedByUser: { title: true } };
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({ ...modalPatch })
  );
  assert.equal(canonical.fields.title!.provenance, "USER_ENTERED");
  assert.equal(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.title!.requiresReview, false);
});

// Trusted human state survives legitimate subsequent UI transformations: a later
// AI attribute patch cannot erase it (top-level state is preserved through
// updateAiDraft merges).
test("B3: trusted editedByUser survives subsequent AI attribute patch", () => {
  const humanDraft = baseDraft({
    title: "Žmogaus antraštė",
    editedByUser: { title: true },
  });
  const afterAiPatch: AiExtractedListing = {
    ...humanDraft,
    attributes: { ...(humanDraft.attributes ?? {}), deviceModel: "iPhone 15" },
  };
  const canonical = buildCanonicalDraftFromListing(afterAiPatch);
  assert.equal(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields["attributes.deviceModel"]!.reviewState, "AI_SUGGESTED");
});

// AI suggestion after human edit cannot overwrite human authority (canonical
// merge semantics — Phase A invariant, re-proven at the trusted boundary).
test("B3: AI suggestion cannot overwrite trusted human edit authority", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      title: "Žmogaus antraštė",
      editedByUser: { title: true },
    })
  );
  const merged = mergeAiSuggestion(
    "title",
    canonical.fields.title!,
    createIntelField({ value: "AI siūloma antraštė", provenance: "AI_INFERRED", confidence: 1 })
  );
  assert.equal(merged.field.value, "Žmogaus antraštė");
  assert.equal(merged.field.reviewState, "HUMAN_CONFIRMED");
});

// No marker leaks into the canonical attribute projection (they are stripped).
test("B3: legacy markers never leak into persisted/public canonical attributes", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({
      attributes: { titleEditedByUser: "true", condition: "Naujas" },
    })
  );
  const attributeKeys = Object.keys(canonical.fields).filter((k) =>
    k.startsWith("attributes.")
  );
  assert.ok(!attributeKeys.some((k) => k.endsWith("EditedByUser")));
  assert.ok(attributeKeys.includes("attributes.condition"));
});

// draftNeedsReview invariant remains unchanged: the draft-level policy still
// derives from canonical field state, and a spoofed marker cannot suppress it.
test("B3: draftNeedsReview invariant unchanged under spoofed markers", () => {
  const spoofed = baseDraft({
    title: "x",
    confidence: 0.3,
    attributes: { titleEditedByUser: "true" },
  });
  const canonical = buildCanonicalDraftFromListing(spoofed);
  assert.equal(canonical.fields.title!.requiresReview, true);
  assert.equal(canonical.requiresReview, true);
  assert.equal(draftNeedsReview(canonical), true);
});
