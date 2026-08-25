/**
 * VAUTO canonical → client projection (AI Maturity — Phase B).
 *
 * Derives a minimal, progressive-disclosure view of a canonical
 * ListingIntelDraft for the listing creation/review path. The normal user sees
 * a simple experience (confirmed / suggestion / needs review / unknown);
 * conflict and provenance detail are exposed only when useful (a conflict or a
 * low-confidence review flag).
 *
 * This module is PURE and deterministic. It never publishes, never mutates the
 * draft, and never upgrades AI/context values to human authority.
 */

import {
  classifyIntelConfidence,
  type ListingIntelDraft,
  type ListingIntelField,
  type ListingIntelReviewState,
} from "../listing-intelligence/index";

/** Simple progressive-disclosure classification for one canonical field. */
export type IntelFieldClientState =
  | "CONFIRMED" // human confirmed / manually entered (authoritative)
  | "SUGGESTED" // AI/provenance suggestion awaiting human review
  | "REVIEW" // conflicts or low/unknown confidence → needs human attention
  | "UNKNOWN"; // no value / nothing known

export type IntelFieldSummary<T = unknown> = {
  fieldKey: string;
  value: T | null;
  state: IntelFieldClientState;
  reviewState: ListingIntelReviewState;
  provenance: string;
  confidenceTier: ReturnType<typeof classifyIntelConfidence>;
  /** Present only when a conflict or review is relevant — progressive disclosure. */
  detail?: {
    conflictSources: Array<{ value: unknown; source: string }>;
    lowConfidence: boolean;
  };
};

export type IntelDraftSummary = {
  fields: IntelFieldSummary[];
  /** Draft-level: whether the AI recommends a human review pass (advisory). */
  needsReview: boolean;
  /** Human-readable Lithuanian advisory line (never a publish gate). */
  advisory?: string;
  /** True only when there is at least one open conflict. */
  hasConflicts: boolean;
};

function fieldStateOf(
  field: ListingIntelField<unknown>
): { state: IntelFieldClientState; lowConfidence: boolean } {
  if (field.value == null) return { state: "UNKNOWN", lowConfidence: false };
  if (field.reviewState === "HUMAN_CONFIRMED" || field.reviewState === "HUMAN_OVERRIDDEN") {
    return { state: "CONFIRMED", lowConfidence: false };
  }
  const tier = classifyIntelConfidence(field.confidence);
  const lowConfidence = tier === "LOW" || tier === "UNKNOWN";
  if (field.conflicts.length > 0 || field.requiresReview || lowConfidence) {
    return { state: "REVIEW", lowConfidence };
  }
  return { state: "SUGGESTED", lowConfidence: false };
}

function advisoryFor(draft: ListingIntelDraft): string | undefined {
  const conflictCount = Object.values(draft.fields).filter(
    (f) => f.conflicts.length > 0
  ).length;
  if (conflictCount > 0) {
    return `Šaltiniai nesutampa ${conflictCount} lauke — patikrinkite ir pasirinkite galutinę reikšmę.`;
  }
  const reviewCount = Object.values(draft.fields).filter((f) => f.requiresReview).length;
  if (reviewCount > 0) {
    return "Kai kurias AI siūlomas reikšmes verta patikrinti prieš publikavimą.";
  }
  return undefined;
}

/**
 * Project a canonical draft into the progressive-disclosure client view.
 * Deterministic; never mutates the draft; never gates publishing.
 */
export function projectIntelDraft(draft: ListingIntelDraft | undefined): IntelDraftSummary {
  if (!draft) {
    return { fields: [], needsReview: false, hasConflicts: false };
  }
  const fields: IntelFieldSummary[] = Object.entries(draft.fields).map(
    ([fieldKey, field]) => {
      const { state, lowConfidence } = fieldStateOf(field);
      const summary: IntelFieldSummary = {
        fieldKey,
        value: field.value,
        state,
        reviewState: field.reviewState,
        provenance: field.provenance,
        confidenceTier: classifyIntelConfidence(field.confidence),
      };
      if (state === "REVIEW") {
        summary.detail = {
          conflictSources: field.conflicts.flatMap((c) =>
            c.candidates.map((cand) => ({ value: cand.value, source: cand.source }))
          ),
          lowConfidence,
        };
      }
      return summary;
    }
  );
  const hasConflicts = fields.some((f) => f.state === "REVIEW" && (f.detail?.conflictSources.length ?? 0) > 0);
  const needsReview = draft.requiresReview || fields.some((f) => f.state === "REVIEW" || f.state === "UNKNOWN");
  return {
    fields,
    needsReview,
    advisory: advisoryFor(draft),
    hasConflicts,
  };
}

export type {
  ListingIntelDraft,
  ListingIntelField,
};
