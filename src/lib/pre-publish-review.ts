import type { AiExtractedListing } from "@/lib/types";
import type { PrePublishReadiness } from "@/lib/pre-publish-validation";
import {
  classifyIntelConfidence,
  confidenceReviewAdvice,
  createIntelField,
  draftNeedsReview,
  INTEL_LOW_CONFIDENCE_REVIEW_MAX,
  normalizeIntelConfidence,
  type IntelConfidenceTier,
  type ListingIntelDraft,
  type ListingIntelField,
} from "@vauto/shared/listing-intelligence";
import {
  projectIntelDraft,
  type IntelDraftSummary,
} from "@vauto/shared/intelligence-projection";

/**
 * Non-blocking pre-publish review hints derived from existing draft/readiness
 * data. Purely informational — publishing stays a human decision and is never
 * gated by these hints. This surfaces fact/uncertainty to the reviewer
 * ("Patikrinkite prieš publikavimą") without changing any AI behavior.
 *
 * Confidence classification is delegated to the canonical listing-intelligence
 * contract (@vauto/shared/listing-intelligence) so there is exactly ONE source
 * of truth for confidence/uncertainty semantics across client, server and
 * shared policy.
 *
 * Phase B: `buildCanonicalDraftFromListing` + `summarizeCanonicalDraft` bring
 * the canonical ListingIntelDraft into the real client review path
 * (progressive disclosure). Publishing remains 100% manual.
 */

export interface DraftReviewHint {
  id: string;
  text: string;
}

const LOW_CONFIDENCE_THRESHOLD = INTEL_LOW_CONFIDENCE_REVIEW_MAX;

function reviewNoticeHints(draft: AiExtractedListing): DraftReviewHint[] {
  const hints: DraftReviewHint[] = [];
  if (draft.requiresReview) {
    hints.push({
      id: "requires-review",
      text:
        draft.reviewNotice?.trim() ||
        "AI pažymėjo, kad kai kuriuos duomenis verta patikrinti prieš publikavimą.",
    });
  }
  return hints;
}

function lowConfidenceHints(draft: AiExtractedListing): DraftReviewHint[] {
  if (typeof draft.confidence !== "number") return [];
  // Canonical policy: LOW tier (or below the shared advisory threshold) surfaces
  // the advisory hint. Unknown confidence is NOT treated as high.
  const tier: IntelConfidenceTier = classifyIntelConfidence(draft.confidence);
  if (
    Number.isFinite(draft.confidence) &&
    confidenceReviewAdvice(draft.confidence) === "REVIEW"
  ) {
    return [
      {
        id: "low-confidence",
        text: "AI užtikrintumas dėl ištrauktų duomenų žemas — peržiūrėkite laukus ranka.",
      },
    ];
  }
  // Keep explicit tier reference for audit clarity (unused value is intentional).
  void tier;
  return [];
}

function documentEvidenceHints(draft: AiExtractedListing): DraftReviewHint[] {
  const attributes = draft.attributes ?? {};
  const raw = attributes.documentImageUrls ?? attributes.documentUrls;
  const hasDocuments =
    (Array.isArray(raw) && raw.length > 0) ||
    (typeof raw === "string" && raw.trim().length > 0);
  if (!hasDocuments) return [];
  return [
    {
      id: "document-specs",
      text: "Specifikacijos ištrauktos iš dokumentų — patikrinkite, ar jos teisingos.",
    },
  ];
}

function photolessHints(
  draft: AiExtractedListing,
  readiness: PrePublishReadiness
): DraftReviewHint[] {
  if (!readiness.missingPhoto) return [];
  return [
    {
      id: "no-photo",
      text: "Skelbimas neturės viešos nuotraukos — pirkėjai matys tik tekstą.",
    },
  ];
}

export function buildDraftReviewHints(
  draft: AiExtractedListing,
  readiness: PrePublishReadiness
): DraftReviewHint[] {
  return [
    ...reviewNoticeHints(draft),
    ...lowConfidenceHints(draft),
    ...documentEvidenceHints(draft),
    ...photolessHints(draft, readiness),
  ];
}

/** Keep threshold import referenced for audit/traceability. */
export const REVIEW_HINT_LOW_CONFIDENCE_THRESHOLD = LOW_CONFIDENCE_THRESHOLD;

/* -------------------------------------------------------------------------- */
/* Phase B — canonical draft consumption in the real client review path        */
/* -------------------------------------------------------------------------- */

/**
 * Map a client `AiExtractedListing` into the canonical ListingIntelDraft.
 *
 * PROVENANCE != AUTHORITY (certified Phase A semantics):
 * - A value being present/editable on the PrePublish surface is NOT evidence of
 *   human authorship. Human authority (`USER_ENTERED` / `HUMAN_CONFIRMED`)
 *   originates ONLY from an explicit human event through the TRUSTED boundary:
 *   the `editedByUser` typed state, which is set exclusively by trusted local
 *   input handlers (`updateAiDraft({ …, editedByUser: { title: true } })`) —
 *   never from `attributes`.
 * - Legacy `*EditedByUser` attribute markers (titleEditedByUser /
 *   priceEditedByUser / locationEditedByUser / descriptionEditedByUser) are
 *   treated as untrusted DATA: they can arrive from AI/provider/document/
 *   import/hydration payloads and MUST NOT manufacture human authority. They
 *   are stripped from the canonical attribute projection and ignored by the
 *   authority decision (see `stripLegacyEditMarkerAttributes`).
 * - Unknown-origin values (no trusted edit evidence) are conservatively
 *   classified as AI_INFERRED / AI_SUGGESTED with the draft's real normalized
 *   confidence — NEVER upgraded to human authority by high confidence, by UI
 *   display, or by any attribute marker.
 * - Legacy document attributes surface as DOCUMENT provenance.
 * - Draft-level `requiresReview` is derived through the canonical Phase A
 *   `draftNeedsReview()` policy — one review policy, never a second one.
 * - The function is pure and never publishes.
 */

/** Untrusted legacy edit-marker keys — stripped from the attribute projection. */
const LEGACY_EDIT_MARKER_KEYS = new Set([
  "titleEditedByUser",
  "priceEditedByUser",
  "locationEditedByUser",
  "descriptionEditedByUser",
]);

export function stripLegacyEditMarkerAttributes(
  attributes: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!attributes) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (LEGACY_EDIT_MARKER_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function buildCanonicalDraftFromListing(
  draft: AiExtractedListing
): ListingIntelDraft {
  const fields: Record<string, ListingIntelField<unknown>> = {};

  // Trusted boundary: only the typed `editedByUser` state may prove human
  // authorship. Attribute markers are never trusted authority.
  const rawAttrs = (draft.attributes ?? {}) as Record<string, unknown>;
  const attrs = stripLegacyEditMarkerAttributes(rawAttrs);
  const hasDocumentEvidence =
    Array.isArray(attrs.documentImageUrls) || Array.isArray(attrs.documentUrls) ||
    (typeof attrs.documentImageUrls === "string" && attrs.documentImageUrls.length > 0) ||
    (typeof attrs.documentUrls === "string" && attrs.documentUrls.length > 0);

  const confidence = normalizeIntelConfidence(draft.confidence);
  const humanEdited = draft.editedByUser ?? {};

  const humanEntered = (value: unknown): ListingIntelField<unknown> =>
    createIntelField({
      value: value ?? null,
      provenance: "USER_ENTERED",
      confidence,
      reviewState: "HUMAN_CONFIRMED",
    });

  const aiSuggested = (value: unknown): ListingIntelField<unknown> =>
    createIntelField({
      value: value ?? null,
      provenance: "AI_INFERRED",
      confidence,
    });

  if (draft.title) {
    fields.title = humanEdited.title
      ? humanEntered(draft.title)
      : aiSuggested(draft.title);
  }
  if (draft.price > 0) {
    fields.price = humanEdited.price
      ? humanEntered(draft.price)
      : aiSuggested(draft.price);
  }
  if (draft.location) {
    fields.location = humanEdited.location
      ? humanEntered(draft.location)
      : aiSuggested(draft.location);
  }
  if (draft.category) fields.category = aiSuggested(draft.category);
  if (draft.description) {
    fields.description = humanEdited.description
      ? humanEntered(draft.description)
      : aiSuggested(draft.description);
  }

  for (const [key, value] of Object.entries(attrs)) {
    if (
      key === "documentImageUrls" ||
      key === "documentUrls" ||
      key === "documentOcrSoftNote"
    ) {
      continue;
    }
    if (value == null || value === "") continue;
    const fieldKey = `attributes.${key}`;
    fields[fieldKey] = hasDocumentEvidence
      ? createIntelField({
          value,
          provenance: "DOCUMENT",
          confidence: null,
          requiresReview: true,
        })
      : aiSuggested(value);
  }

  const canonical = { fields, requiresReview: false, reviewReasons: [] };
  // Draft-level review is derived from canonical field state (Phase A policy).
  return { ...canonical, requiresReview: draftNeedsReview(canonical) };
}

/**
 * Project a client listing's canonical draft into the progressive-disclosure
 * summary. Used by the review surface to show confirmed / suggestion / review /
 * unknown without a technical dashboard. Advisory only.
 */
export function summarizeCanonicalDraft(
  draft: AiExtractedListing | null | undefined
): IntelDraftSummary {
  if (!draft) {
    return { fields: [], needsReview: false, hasConflicts: false };
  }
  return projectIntelDraft(buildCanonicalDraftFromListing(draft));
}
