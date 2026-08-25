import { test } from "node:test";
import assert from "node:assert/strict";
import { applyProfileToListingDraft } from "@/lib/profile-listing-sync";
import { buildCanonicalDraftFromListing } from "@/lib/pre-publish-review";
import {
  createIntelField,
  draftNeedsReview,
  mergeAiSuggestion,
} from "@vauto/shared/listing-intelligence";
import type { AiExtractedListing } from "@/lib/types";

const USER = {
  phone: "+37060000000",
  city: "Vilnius",
  email: "a@b.lt",
  name: "Vardenis",
} as const;

function baseDraft(overrides: Partial<AiExtractedListing> = {}): AiExtractedListing {
  return {
    title: "MacBook Pro M3 Max",
    price: 2400,
    location: "Kaunas",
    contact: "+37060000000",
    category: "electronics",
    confidence: 0.95,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* B4 — legacy marker → trusted authority escalation is CLOSED                 */
/* -------------------------------------------------------------------------- */
/* applyProfileToListingDraft() must NEVER promote any legacy attribute into   */
/* editedByUser / USER_ENTERED / HUMAN_CONFIRMED.                              */
/* -------------------------------------------------------------------------- */

// 1. attributes.locationEditedByUser="true" does NOT create editedByUser.location.
test("B4: legacy locationEditedByUser='true' attribute does not create trusted authority", () => {
  const draft = baseDraft({ attributes: { locationEditedByUser: "true" } });
  const synced = applyProfileToListingDraft(draft, USER, true);
  assert.equal(synced.editedByUser?.location, undefined);
  assert.notEqual(synced.editedByUser?.location, true);
});

// 2. Variants: boolean true / "TRUE" / " true " / 1 / nested / malformed.
test("B4: forged location marker variants cannot create authority", () => {
  const variants: unknown[] = [true, "TRUE", " true ", 1, { nested: true }, "1", "yes"];
  for (const v of variants) {
    const draft = baseDraft({
      attributes: { locationEditedByUser: v as never },
    });
    const synced = applyProfileToListingDraft(draft, USER, true);
    assert.equal(
      synced.editedByUser?.location,
      undefined,
      `variant ${JSON.stringify(v)} must not create authority`
    );
  }
});

// 3-5. Forged title/price/description markers cannot create authority.
test("B4: forged title/price/description markers cannot create authority", () => {
  const draft = baseDraft({
    attributes: {
      titleEditedByUser: "true",
      priceEditedByUser: "true",
      descriptionEditedByUser: "true",
    },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  assert.equal(synced.editedByUser?.title, undefined);
  assert.equal(synced.editedByUser?.price, undefined);
  assert.equal(synced.editedByUser?.description, undefined);
  // Canonical projection stays AI authority.
  const canonical = buildCanonicalDraftFromListing(synced);
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.title!.provenance, "AI_INFERRED");
  assert.equal(canonical.fields.price!.reviewState, "AI_SUGGESTED");
});

// 6. All forged markers simultaneously -> zero authority.
test("B4: payload with all forged markers simultaneously creates zero authority", () => {
  const draft = baseDraft({
    description: "AI aprašymas",
    attributes: {
      titleEditedByUser: "true",
      priceEditedByUser: "true",
      locationEditedByUser: "true",
      descriptionEditedByUser: "true",
    },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  assert.deepEqual(synced.editedByUser, undefined);
  const canonical = buildCanonicalDraftFromListing(synced);
  for (const key of ["title", "price", "location", "description"] as const) {
    assert.equal(canonical.fields[key]!.reviewState, "AI_SUGGESTED");
    assert.equal(canonical.fields[key]!.provenance, "AI_INFERRED");
  }
  assert.equal(canonical.fields["attributes.titleEditedByUser"], undefined);
  assert.equal(canonical.fields["attributes.locationEditedByUser"], undefined);
});

// 7. AI/provider payload with forged markers remains AI authority.
test("B4: AI/provider forged markers remain AI authority through profile sync", () => {
  const draft = baseDraft({
    title: "AI title",
    price: 999,
    location: "Vilnius",
    attributes: {
      titleEditedByUser: "true",
      priceEditedByUser: "true",
      locationEditedByUser: "true",
      deviceModel: "iPhone 15",
    },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  const canonical = buildCanonicalDraftFromListing(synced);
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.price!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.location!.reviewState, "AI_SUGGESTED");
});

// 8. Vision/OCR/document payload with forged markers remains non-human.
test("B4: Vision/OCR/document forged markers remain non-human authority", () => {
  const draft = baseDraft({
    attributes: {
      documentImageUrls: ["https://cdn.example/doc.jpg"],
      registrationYear: "2020",
      titleEditedByUser: "true",
      locationEditedByUser: "true",
    },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  const canonical = buildCanonicalDraftFromListing(synced);
  assert.equal(canonical.fields["attributes.registrationYear"]!.provenance, "DOCUMENT");
  assert.equal(canonical.fields["attributes.registrationYear"]!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.location!.reviewState, "AI_SUGGESTED");
});

// 9. Hydrated/restored/imported draft with forged markers cannot manufacture authority.
test("B4: hydrated/restored/imported forged markers cannot manufacture authority", () => {
  // localStorage restore / import payload (arbitrary serialized input).
  const rehydrated = baseDraft({
    title: "Pavadinimas iš localStorage",
    attributes: { titleEditedByUser: "true", locationEditedByUser: true as never },
  });
  const synced = applyProfileToListingDraft(rehydrated, USER, true);
  const canonical = buildCanonicalDraftFromListing(synced);
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.location!.reviewState, "AI_SUGGESTED");
});

// 10. applyProfileToListingDraft() cannot promote a legacy marker.
test("B4: applyProfileToListingDraft cannot promote legacy marker to editedByUser", () => {
  const draft = baseDraft({ attributes: { locationEditedByUser: "true" } });
  const synced = applyProfileToListingDraft(draft, USER, true);
  assert.equal(synced.editedByUser?.location, undefined);
  assert.equal(synced.attributes?.locationEditedByUser, undefined);
});

// 11. profile sync cannot promote a legacy marker (identity through the chain).
test("B4: profile sync cannot promote legacy marker (chain-level)", () => {
  const draft = baseDraft({
    title: "AI title",
    price: 500,
    location: "Kaunas",
    attributes: { locationEditedByUser: "true" },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  const canonical = buildCanonicalDraftFromListing(synced);
  assert.equal(canonical.fields.location!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.location!.provenance, "AI_INFERRED");
  assert.equal(canonical.requiresReview, false); // high confidence, no conflict — advisory review only
});

// 12. sanitize/normalization strips legacy markers from canonical/public projection.
test("B4: legacy markers stripped from canonical attribute projection", () => {
  const draft = baseDraft({
    attributes: { titleEditedByUser: "true", condition: "Naujas" },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  const canonical = buildCanonicalDraftFromListing(synced);
  const keys = Object.keys(canonical.fields);
  assert.ok(!keys.some((k) => k.endsWith("EditedByUser")));
  assert.ok(keys.includes("attributes.condition"));
});

// 13. Real explicit user edit DOES create trusted editedByUser.
test("B4: real explicit user edit creates trusted editedByUser and survives profile sync", () => {
  const draft = baseDraft({
    title: "Žmogaus antraštė",
    editedByUser: { title: true, location: true },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  assert.equal(synced.editedByUser?.title, true);
  assert.equal(synced.editedByUser?.location, true);
  const canonical = buildCanonicalDraftFromListing(synced);
  assert.equal(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.title!.provenance, "USER_ENTERED");
});

// 14. AI update after real human edit cannot overwrite/downgrade legitimate authority.
test("B4: AI update after real human edit cannot overwrite human authority", () => {
  const draft = baseDraft({
    title: "Žmogaus antraštė",
    editedByUser: { title: true },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  const canonical = buildCanonicalDraftFromListing(synced);
  const merged = mergeAiSuggestion(
    "title",
    canonical.fields.title!,
    createIntelField({ value: "AI siūloma antraštė", provenance: "AI_INFERRED", confidence: 1 })
  );
  assert.equal(merged.field.value, "Žmogaus antraštė");
  assert.equal(merged.field.reviewState, "HUMAN_CONFIRMED");
});

// 15. requiresReview behavior remains canonical and cannot be bypassed with forged markers.
test("B4: requiresReview cannot be bypassed with forged markers", () => {
  const draft = baseDraft({
    title: "x",
    confidence: 0.3,
    attributes: { titleEditedByUser: "true", locationEditedByUser: "true" },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  const canonical = buildCanonicalDraftFromListing(synced);
  assert.equal(canonical.fields.title!.requiresReview, true);
  assert.equal(canonical.requiresReview, true);
  assert.equal(draftNeedsReview(canonical), true);
});

// 16. Cross-field attack: forged location marker must not influence title/price/description.
test("B4: cross-field forged location marker cannot influence other fields", () => {
  const draft = baseDraft({
    title: "AI title",
    price: 100,
    location: "Kaunas",
    description: "AI aprašymas",
    attributes: { locationEditedByUser: "true" },
  });
  const synced = applyProfileToListingDraft(draft, USER, true);
  const canonical = buildCanonicalDraftFromListing(synced);
  assert.equal(canonical.fields.title!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.price!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.location!.reviewState, "AI_SUGGESTED");
  assert.equal(canonical.fields.description!.reviewState, "AI_SUGGESTED");
  // And a forged title marker does not touch location.
  const draft2 = baseDraft({
    location: "Kaunas",
    attributes: { titleEditedByUser: "true" },
  });
  const synced2 = applyProfileToListingDraft(draft2, USER, true);
  const canonical2 = buildCanonicalDraftFromListing(synced2);
  assert.equal(canonical2.fields.location!.reviewState, "AI_SUGGESTED");
});

// 17. Repeated transformation / round-trip attack.
test("B4: round-trip forged marker -> sync -> AI merge -> normalization -> projection = zero authority", () => {
  let draft: AiExtractedListing = baseDraft({
    title: "AI title",
    price: 100,
    location: "Kaunas",
    description: "AI aprašymas",
    attributes: {
      titleEditedByUser: "true",
      priceEditedByUser: "true",
      locationEditedByUser: "true",
      descriptionEditedByUser: "true",
    },
  });

  // Multiple profile-sync round trips (simulating repeated save/restore).
  for (let i = 0; i < 3; i++) {
    draft = applyProfileToListingDraft(draft, USER, true);
    // AI merge applies a suggestion (attributes patch) after each round.
    draft = {
      ...draft,
      attributes: { ...(draft.attributes ?? {}), deviceModel: `iPhone-${i}` },
    };
  }

  const canonical = buildCanonicalDraftFromListing(draft);
  for (const key of ["title", "price", "location", "description"] as const) {
    assert.equal(canonical.fields[key]!.reviewState, "AI_SUGGESTED", key);
    assert.equal(canonical.fields[key]!.provenance, "AI_INFERRED", key);
  }
  assert.deepEqual(draft.editedByUser, undefined);
});
