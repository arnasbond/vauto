import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDraftReviewHints } from "@/lib/pre-publish-review";
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
