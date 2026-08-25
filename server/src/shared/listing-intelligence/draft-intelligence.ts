/**
 * VAUTO listing-draft intelligence contract (AI Maturity — Phase A).
 *
 * One canonical, shared representation for "what the AI believes belongs here"
 * together with *where it came from*, *how confident we are*, *whether it is
 * uncertain*, *whether sources disagree*, and *whether a human has reviewed or
 * overridden it*.
 *
 * Design constraints (from the AI Maturity block):
 * - Reuses / extends the existing server `ExtractedField` shape (value,
 *   confidence, source, requiresConfirmation, evidence) — it does NOT replace it.
 * - Crosses the client/server boundary safely (plain JSON, no class instances,
 *   no functions, no dates).
 * - Never fabricates provenance or fake numeric confidence.
 * - PROVENANCE != AUTHORITY: where a value came from and whether a human
 *   explicitly confirmed it are different dimensions. Only explicit human
 *   confirmation / direct manual canonical-field entry (USER_ENTERED) may carry
 *   HUMAN_CONFIRMED / HUMAN_OVERRIDDEN authority. CONTEXT, USER_TEXT, VISION,
 *   DOCUMENT, SCHEMA and AI_INFERRED never silently gain human authority.
 * - AI must never silently overwrite a human-confirmed value.
 * - No field here can independently authorize publication — publishing stays
 *   100% manual and is enforced by the existing publish boundary.
 */

/** Where a draft field value came from. */
export const LISTING_INTEL_SOURCES = [
  "USER_TEXT",
  "USER_ENTERED",
  "VISION",
  "DOCUMENT",
  "SCHEMA",
  "CONTEXT",
  "AI_INFERRED",
  "UNKNOWN",
] as const;

export type ListingIntelSource = (typeof LISTING_INTEL_SOURCES)[number];

/** Human review / override semantics for a single draft field. */
export const LISTING_INTEL_REVIEW_STATES = [
  /** AI suggested; no human interaction yet. */
  "AI_SUGGESTED",
  /** Conflicts or low confidence → the field must be reviewed by the human. */
  "NEEDS_REVIEW",
  /** Human explicitly confirmed the value. */
  "HUMAN_CONFIRMED",
  /** Human explicitly edited/overrode the AI-suggested value. */
  "HUMAN_OVERRIDDEN",
] as const;

export type ListingIntelReviewState = (typeof LISTING_INTEL_REVIEW_STATES)[number];

/** A single competing value from one source (used by conflicts). */
export type ListingIntelCandidate<T> = {
  value: T;
  source: ListingIntelSource;
  /** Confidence for this candidate when the source provides one; null = unknown. */
  confidence: number | null;
};

/** Explicit representation of conflicting evidence for one draft field. */
export type ListingIntelConflict<T> = {
  /**
   * Stable canonical field key, e.g. "year" or "attributes.bodyColor".
   * The merge operation receives the real key from the caller — it is never a
   * placeholder and never derived from display labels / array positions.
   */
  fieldKey: string;
  candidates: [ListingIntelCandidate<T>, ListingIntelCandidate<T>, ...ListingIntelCandidate<T>[]];
  /** Human-readable review prompt (Lithuanian, advisory). */
  message: string;
};

/**
 * Canonical per-field intelligence.
 *
 * `value` mirrors the legacy `ExtractedField<T>` shape. `confidence` is a number
 * in [0,1] when the provider supplies one, or null when unknown — unknown is
 * explicitly distinguishable from high confidence. `uncertainty` is
 * machine-readable and never only prose.
 */
export type ListingIntelField<T> = {
  value: T | null;
  provenance: ListingIntelSource;
  confidence: number | null;
  requiresReview: boolean;
  conflicts: ListingIntelConflict<T>[];
  reviewState: ListingIntelReviewState;
};

/** Canonical draft intelligence: keyed by field key, plus draft-level flags. */
export type ListingIntelDraft = {
  /** Field-level canonical intelligence, keyed by field key. */
  fields: Record<string, ListingIntelField<unknown>>;
  /** Draft-level: AI suggests the draft needs a human review before publish. */
  requiresReview: boolean;
  /** Draft-level advisory reason(s) (Lithuanian, advisory). */
  reviewReasons: string[];
};

/* -------------------------------------------------------------------------- */
/* Policy constants                                                            */
/* -------------------------------------------------------------------------- */

/** High-confidence floor — matches server `confidence.ts` HIGH tier. */
export const INTEL_HIGH_CONFIDENCE_MIN = 0.9;
/** Medium-confidence floor — matches server `confidence.ts` MEDIUM tier. */
export const INTEL_MEDIUM_CONFIDENCE_MIN = 0.7;
/** Clients rendering hints use this threshold (same as pre-publish-review.ts). */
export const INTEL_LOW_CONFIDENCE_REVIEW_MAX = 0.75;

/* -------------------------------------------------------------------------- */
/* Confidence                                                                  */
/* -------------------------------------------------------------------------- */

export type IntelConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

/**
 * Enforce the declared [0,1] runtime invariant for confidence.
 *
 * Invariant: confidence is `number | null` where a number must satisfy
 * `0 <= confidence <= 1` and be finite. Invalid inputs (NaN, ±Infinity,
 * out-of-range) become `null` — explicitly unknown — and can therefore never
 * classify as HIGH. No silent clamping (e.g. `1.7 -> 1`): clamping would hide
 * upstream/provider defects and manufacture false certainty. Review semantics
 * treat the normalized unknown exactly like a missing confidence (reviewable,
 * never a publish gate).
 */
export function normalizeIntelConfidence(
  confidence: number | null | undefined
): number | null {
  if (typeof confidence !== "number") return null;
  if (!Number.isFinite(confidence)) return null;
  if (confidence < 0 || confidence > 1) return null;
  return confidence;
}

/**
 * Classify a confidence value without manufacturing false precision.
 * Invalid values (non-finite or outside [0,1]) → UNKNOWN, never HIGH.
 * Unknown is NOT equal to high confidence.
 */
export function classifyIntelConfidence(confidence: number | null | undefined): IntelConfidenceTier {
  const normalized = normalizeIntelConfidence(confidence);
  if (normalized === null) return "UNKNOWN";
  if (normalized >= INTEL_HIGH_CONFIDENCE_MIN) return "HIGH";
  if (normalized >= INTEL_MEDIUM_CONFIDENCE_MIN) return "MEDIUM";
  return "LOW";
}

/** Deterministic low-confidence check (used by hint adapters). */
export function isLowConfidence(confidence: number | null | undefined): boolean {
  return classifyIntelConfidence(confidence) === "LOW";
}

/**
 * A categorical review recommendation derived from confidence, NOT an
 * authorization gate. Returns "review" / "no-review" / "cannot-assess".
 */
export type ConfidenceReviewAdvice = "REVIEW" | "NO_REVIEW" | "CANNOT_ASSESS";

export function confidenceReviewAdvice(
  confidence: number | null | undefined
): ConfidenceReviewAdvice {
  const tier = classifyIntelConfidence(confidence);
  if (tier === "UNKNOWN") return "CANNOT_ASSESS";
  if (tier === "LOW") return "REVIEW";
  if (tier === "MEDIUM" && confidence != null && confidence < INTEL_LOW_CONFIDENCE_REVIEW_MAX) {
    return "REVIEW";
  }
  return "NO_REVIEW";
}

/* -------------------------------------------------------------------------- */
/* Constructors                                                                */
/* -------------------------------------------------------------------------- */

export type IntelFieldInit<T> = {
  value: T | null;
  provenance?: ListingIntelSource;
  confidence?: number | null;
  requiresReview?: boolean;
  conflicts?: ListingIntelConflict<T>[];
  reviewState?: ListingIntelReviewState;
};

/**
 * Create a canonical field. Defaults:
 * - provenance UNKNOWN when not given (never fabricate).
 * - confidence null when not given or invalid (unknown ≠ high; invalid never HIGH).
 * - requiresReview = true when conflicts exist, or when the value is AI/context
 *   sourced and confidence is LOW/UNKNOWN. A human-fixed field never gets forced
 *   to require review by unknown confidence.
 * - reviewState = AI_SUGGESTED unless the value came from direct manual
 *   canonical-field entry (USER_ENTERED), or an explicit reviewState is given.
 *
 * Authority rule (PROVENANCE != AUTHORITY): CONTEXT, USER_TEXT, VISION,
 * DOCUMENT, SCHEMA and AI_INFERRED never default to HUMAN_CONFIRMED. Only
 * USER_ENTERED (direct manual canonical-field entry) or an explicit
 * reviewState / applyHumanValue() may create human authority.
 */
export function createIntelField<T>(init: IntelFieldInit<T>): ListingIntelField<T> {
  const confidence = normalizeIntelConfidence(init.confidence);
  const conflicts = init.conflicts ?? [];
  const source = init.provenance ?? "UNKNOWN";
  const defaultReviewState: ListingIntelReviewState =
    source === "USER_ENTERED" ? "HUMAN_CONFIRMED" : "AI_SUGGESTED";
  const reviewState = init.reviewState ?? defaultReviewState;
  const humanFixed =
    reviewState === "HUMAN_CONFIRMED" || reviewState === "HUMAN_OVERRIDDEN";
  const requiresReview =
    init.requiresReview ??
    (conflicts.length > 0 ||
      (!humanFixed &&
        (isLowConfidence(confidence) || classifyIntelConfidence(confidence) === "UNKNOWN")));
  return {
    value: init.value,
    provenance: source,
    confidence,
    requiresReview,
    conflicts,
    reviewState,
  };
}

/* -------------------------------------------------------------------------- */
/* Human override / review semantics                                           */
/* -------------------------------------------------------------------------- */

/**
 * Critical invariant: a human-confirmed or human-overridden value is stronger
 * than any AI suggestion. `applyHumanValue` writes the human value and marks the
 * field HUMAN_CONFIRMED / HUMAN_OVERRIDDEN, clearing conflicts (the human has
 * decided).
 */
export function applyHumanValue<T>(
  field: ListingIntelField<T>,
  humanValue: T,
  opts?: { overridden?: boolean }
): ListingIntelField<T> {
  return {
    ...field,
    value: humanValue,
    requiresReview: false,
    conflicts: [],
    reviewState: opts?.overridden ? "HUMAN_OVERRIDDEN" : "HUMAN_CONFIRMED",
  };
}

/**
 * Invariant guard: merging a new AI suggestion into a draft must NEVER
 * overwrite a human-confirmed/overridden field. Returns true when the merge is
 * allowed (field is not human-fixed), false when the AI suggestion must be
 * rejected/kept-as-conflict instead.
 */
export function canAiOverwriteField(field: ListingIntelField<unknown> | undefined): boolean {
  if (!field) return true;
  return (
    field.reviewState !== "HUMAN_CONFIRMED" &&
    field.reviewState !== "HUMAN_OVERRIDDEN"
  );
}

/**
 * Deterministic merge of a new AI suggestion into existing canonical fields.
 *
 * `fieldKey` is the real stable canonical field path (e.g. "year",
 * "attributes.bodyColor") and is recorded verbatim on any created conflict —
 * never a placeholder, never inferred from labels or array positions.
 *
 * - Never overwrites a human-confirmed/overridden field (and never dilutes its
 *   provenance when an agreeing suggestion arrives).
 * - When the new value conflicts with the existing (non-human) value, creates an
 *   explicit conflict instead of silently picking the higher-confidence one.
 * - When values agree, updates confidence/uncertainty only.
 */
export function mergeAiSuggestion<T>(
  fieldKey: string,
  existing: ListingIntelField<T> | undefined,
  incoming: ListingIntelField<T>
): { field: ListingIntelField<T>; conflictCreated: boolean } {
  if (!existing) return { field: incoming, conflictCreated: false };
  if (!canAiOverwriteField(existing)) {
    return { field: existing, conflictCreated: false };
  }

  const valuesEqual =
    existing.value === incoming.value ||
    (existing.value != null &&
      incoming.value != null &&
      typeof existing.value === "object" &&
      typeof incoming.value === "object" &&
      JSON.stringify(existing.value) === JSON.stringify(incoming.value));

  if (valuesEqual) {
    // Same value — merge provenance/confidence, keep review state. A human-fixed
    // field stays untouched: an agreeing suggestion must not dilute human
    // authority (e.g. re-label a confirmed value as CONTEXT-derived).
    if (!canAiOverwriteField(existing)) {
      return { field: existing, conflictCreated: false };
    }
    return {
      field: {
        ...existing,
        provenance: incoming.provenance,
        confidence: incoming.confidence,
        requiresReview: existing.requiresReview || incoming.requiresReview,
        reviewState: existing.reviewState,
      },
      conflictCreated: false,
    };
  }

  if (existing.value == null) {
    // Empty slot — accept the AI suggestion.
    return { field: incoming, conflictCreated: false };
  }

  if (incoming.value == null) {
    // No new value to write — keep the existing field as-is.
    return { field: existing, conflictCreated: false };
  }

  const existingValue: T = existing.value;
  const incomingValue: T = incoming.value;

  const conflict: ListingIntelConflict<T> = {
    fieldKey,
    candidates: [
      { value: existingValue, source: existing.provenance, confidence: existing.confidence },
      { value: incomingValue, source: incoming.provenance, confidence: incoming.confidence },
    ],
    message:
      "Šaltiniai nesutampa — žmogus turi nuspręsti galutinę reikšmę.",
  };

  return {
    field: {
      ...existing,
      value: existingValue,
      conflicts: [...existing.conflicts, conflict],
      requiresReview: true,
      reviewState: existing.reviewState === "AI_SUGGESTED" ? "NEEDS_REVIEW" : existing.reviewState,
    },
    conflictCreated: true,
  };
}

/** Extract the effective value for a field key from a canonical draft. */
export function intelFieldValue(
  draft: ListingIntelDraft,
  fieldKey: string
): unknown {
  return draft.fields[fieldKey]?.value ?? null;
}

/** Count draft fields that still need review. */
export function countFieldsNeedingReview(draft: ListingIntelDraft): number {
  let count = 0;
  for (const key of Object.keys(draft.fields)) {
    if (draft.fields[key]?.requiresReview) count++;
  }
  return count;
}

/** Draft-level review recommendation (advisory — never a publish gate). */
export function draftNeedsReview(draft: ListingIntelDraft): boolean {
  return (
    draft.requiresReview ||
    countFieldsNeedingReview(draft) > 0 ||
    Object.values(draft.fields).some((f) => f.conflicts.length > 0)
  );
}
