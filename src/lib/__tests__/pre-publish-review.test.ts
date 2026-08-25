import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalDraftFromListing,
  buildDraftReviewHints,
  summarizeCanonicalDraft,
} from "@/lib/pre-publish-review";
import type { AiExtractedListing } from "@/lib/types";
import type { PrePublishReadiness } from "@/lib/pre-publish-validation";

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

test("buildCanonicalDraftFromListing marks user-visible fields HUMAN_CONFIRMED", () => {
  const canonical = buildCanonicalDraftFromListing(
    baseDraft({ title: "MacBook Pro", price: 2400, location: "Vilnius" })
  );
  assert.equal(canonical.fields.title!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.price!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.location!.reviewState, "HUMAN_CONFIRMED");
  assert.equal(canonical.fields.title!.provenance, "USER_ENTERED");
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
