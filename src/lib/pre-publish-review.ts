import type { AiExtractedListing } from "@/lib/types";
import type { PrePublishReadiness } from "@/lib/pre-publish-validation";
import {
  classifyIntelConfidence,
  confidenceReviewAdvice,
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
 * - Explicit `USER_ENTERED` semantics: the user-visible fields (title, price,
 *   location) on an editable review surface are treated as direct manual
 *   canonical-field entry → HUMAN_CONFIRMED (the same authority the PrePublish
 *   modal grants when the user edits them).
 * - Every other field is an AI suggestion (AI_INFERRED) with the draft's real
 *   confidence — never upgraded to human authority by high confidence.
 * - Legacy document attributes surface as DOCUMENT provenance.
 * - The function is pure and never publishes.
 */
export function buildCanonicalDraftFromListing(
  draft: AiExtractedListing
): ListingIntelDraft {
  const fields: Record<string, ListingIntelField<unknown>> = {};

  const attrs = (draft.attributes ?? {}) as Record<string, unknown>;
  const hasDocumentEvidence =
    Array.isArray(attrs.documentImageUrls) || Array.isArray(attrs.documentUrls) ||
    (typeof attrs.documentImageUrls === "string" && attrs.documentImageUrls.length > 0) ||
    (typeof attrs.documentUrls === "string" && attrs.documentUrls.length > 0);

  const confidence = normalizeIntelConfidence(draft.confidence);

  const humanEntered = (key: string, value: unknown): ListingIntelField<unknown> => ({
    value: value ?? null,
    provenance: "USER_ENTERED",
    confidence: 1,
    requiresReview: false,
    conflicts: [],
    reviewState: "HUMAN_CONFIRMED",
  });

  const aiSuggested = (key: string, value: unknown): ListingIntelField<unknown> => ({
    value: value ?? null,
    provenance: "AI_INFERRED",
    confidence,
    requiresReview: confidence === null || confidence < 0.9,
    conflicts: [],
    reviewState: "AI_SUGGESTED",
  });

  if (draft.title) fields.title = humanEntered("title", draft.title);
  if (draft.price > 0) fields.price = humanEntered("price", draft.price);
  if (draft.location) fields.location = humanEntered("location", draft.location);
  if (draft.category) fields.category = aiSuggested("category", draft.category);
  if (draft.description) fields.description = aiSuggested("description", draft.description);

  for (const [key, value] of Object.entries(attrs)) {
    if (key === "documentImageUrls" || key === "documentUrls" || key === "documentOcrSoftNote") {
      continue;
    }
    if (value == null || value === "") continue;
    const fieldKey = `attributes.${key}`;
    fields[fieldKey] = hasDocumentEvidence
      ? { value, provenance: "DOCUMENT", confidence: null, requiresReview: true, conflicts: [], reviewState: "AI_SUGGESTED" }
      : aiSuggested(fieldKey, value);
  }

  return {
    fields,
    requiresReview: draft.requiresReview ?? false,
    reviewReasons: [],
  };
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
