import type { AiExtractedListing } from "@/lib/types";
import type { PrePublishReadiness } from "@/lib/pre-publish-validation";
import {
  classifyIntelConfidence,
  confidenceReviewAdvice,
  INTEL_LOW_CONFIDENCE_REVIEW_MAX,
  type IntelConfidenceTier,
} from "@vauto/shared/listing-intelligence";

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
