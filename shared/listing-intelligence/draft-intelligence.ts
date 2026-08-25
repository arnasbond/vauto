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
 * - Human-entered or explicitly confirmed values are stronger than unconfirmed
 *   AI suggestions; AI must never silently overwrite a human-confirmed value.
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
  /** Stable field key, e.g. "year" or "attributes.bodyColor". */
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
 * Classify a confidence value without manufacturing false precision.
 * NaN / missing → UNKNOWN. Unknown is NOT equal to high confidence.
 */
export function classifyIntelConfidence(confidence: number | null | undefined): IntelConfidenceTier {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "UNKNOWN";
  if (confidence >= INTEL_HIGH_CONFIDENCE_MIN) return "HIGH";
  if (confidence >= INTEL_MEDIUM_CONFIDENCE_MIN) return "MEDIUM";
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
 * - confidence null when not given (unknown ≠ high).
 * - requiresReview = true when confidence is LOW/UNKNOWN, or conflicts exist.
 * - reviewState = AI_SUGGESTED unless the value came from a human source.
 */
export function createIntelField<T>(init: IntelFieldInit<T>): ListingIntelField<T> {
  const confidence = init.confidence ?? null;
  const conflicts = init.conflicts ?? [];
  const source = init.provenance ?? "UNKNOWN";
  const humanSource =
    source === "USER_TEXT" || source === "USER_ENTERED" || source === "CONTEXT";
  const requiresReview =
    init.requiresReview ??
    (conflicts.length > 0 ||
      isLowConfidence(confidence) ||
      classifyIntelConfidence(confidence) === "UNKNOWN");
  const reviewState =
    init.reviewState ?? (humanSource ? "HUMAN_CONFIRMED" : "AI_SUGGESTED");
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
 * - Never overwrites a human-confirmed/overridden field.
 * - When the new value conflicts with the existing (non-human) value, creates an
 *   explicit conflict instead of silently picking the higher-confidence one.
 * - When values agree, updates confidence/uncertainty only.
 */
export function mergeAiSuggestion<T>(
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
    // Same value — merge provenance/confidence, keep review state.
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
    fieldKey: "field",
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
