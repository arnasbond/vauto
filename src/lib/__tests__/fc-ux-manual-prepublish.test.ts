/**
 * FC-UX P1 — manual (no-AI) listing creation must be editable for an
 * INCOMPLETE draft. Publication readiness gates PUBLISH, never EDITING: the
 * card payload must build for a generic/empty seed draft so the editor can
 * open before title/price/photo are supplied.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildManualEditCardPayload,
  buildPrePublishCardPayload,
  evaluatePrePublishReadiness,
  type PrePublishReadiness,
} from "@/lib/pre-publish-validation";
import type { AiExtractedListing } from "@/lib/types";

const USER = { id: "u-1", phone: "+37060000001", email: "u@e.lt", city: "Vilnius" };

function incompleteDraft(): AiExtractedListing {
  return {
    title: "Naujas skelbimas",
    description: "",
    price: 0,
    location: "",
    contact: "",
    category: "other",
    confidence: 0,
  };
}

function readinessFor(draft: AiExtractedListing | null): PrePublishReadiness {
  return evaluatePrePublishReadiness({
    isAuthenticated: true,
    user: USER,
    draft,
    previewImage: null,
    pendingImageUrls: [],
    orderedImageUrls: draft?.orderedImageUrls ?? [],
    geoCoords: null,
  });
}

test("an incomplete generic draft is NOT publish-ready (ok=false)", () => {
  const r = readinessFor(incompleteDraft());
  assert.equal(r.ok, false, "incomplete draft must not be publish-ready");
  assert.equal(r.missingTitle, true, "generic title blocks readiness");
});

test("the editor payload still builds for the incomplete draft (editing is not gated)", () => {
  const r = readinessFor(incompleteDraft());
  // The publish-ready card stays gated (F9 missing-guide semantics preserved).
  assert.equal(buildPrePublishCardPayload(r, null), null, "publishable card stays null for incomplete draft");
  // The manual EDITOR payload is NOT gated on readiness.
  const card = buildManualEditCardPayload(r, null);
  assert.ok(card !== null, "editor payload must build for an incomplete draft");
  assert.equal(card?.price, 0);
});

test("a complete draft still builds a publish-ready payload", () => {
  const draft: AiExtractedListing = {
    title: "MacBook Pro M3 Max",
    description: "Naudotas, puikios būklės.",
    price: 2400,
    location: "Vilnius",
    contact: "+37060000001",
    category: "electronics",
    confidence: 0.95,
    orderedImageUrls: ["https://cdn.example/mbp.jpg"],
    attributes: { condition: "Naudotas" },
  };
  const r = readinessFor(draft);
  assert.equal(r.ok, true, "complete draft is publish-ready");
  const card = buildPrePublishCardPayload(r, null);
  assert.ok(card !== null);
  assert.equal(card?.title, "MacBook Pro M3 Max");
});
