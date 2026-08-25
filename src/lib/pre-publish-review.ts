import type { AiExtractedListing } from "@/lib/types";
import type { PrePublishReadiness } from "@/lib/pre-publish-validation";

/**
 * Non-blocking pre-publish review hints derived from existing draft/readiness
 * data. Purely informational — publishing stays a human decision and is never
 * gated by these hints. This surfaces fact/uncertainty to the reviewer
 * ("Patikrinkite prieš publikavimą") without changing any AI behavior.
 */

export interface DraftReviewHint {
  id: string;
  text: string;
}

const LOW_CONFIDENCE_THRESHOLD = 0.75;

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
  if (Number.isFinite(draft.confidence) && draft.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return [
      {
        id: "low-confidence",
        text: "AI užtikrintumas dėl ištrauktų duomenų žemas — peržiūrėkite laukus ranka.",
      },
    ];
  }
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
