/**
 * VAUTO multimodal listing-intelligence adapter (AI Maturity — Phase B).
 *
 * Bridges the legacy/parallel extraction shapes into the ONE canonical
 * ListingIntelDraft contract (shared/listing-intelligence). This adapter is
 * deliberately bounded:
 *
 * - It is a pure deterministic mapper + merge boundary. It performs NO model
 *   calls, NO provider work, NO credential access.
 * - It consumes producer-shaped inputs (SellDraft / ExtractedField<T> /
 *   plain candidate objects) and produces/updates canonical
 *   ListingIntelField<T> / ListingIntelDraft values.
 * - It never fabricates confidence: values without a trustworthy numeric
 *   probability stay null (UNKNOWN) per Phase A semantics.
 * - It never upgrades provenance to human authority: VISION / DOCUMENT /
 *   SCHEMA / CONTEXT / AI_INFERRED never become HUMAN_CONFIRMED here, no
 *   matter how high the confidence.
 * - It treats all media/document/user-derived content as untrusted data, not
 *   executable instructions: adversarial payloads (e.g. "publish automatically")
 *   remain data and cannot alter policy.
 * - Provider failure degrades to manual marketplace flow: absent/empty
 *   extraction simply yields empty/unchanged canonical fields.
 *
 * Core rule: AI PADEDA. ŽMOGUS SPRENDŽIA.
 */

import {
  canAiOverwriteField,
  createIntelField,
  mergeAiSuggestion,
  normalizeIntelConfidence,
  type ListingIntelCandidate,
  type ListingIntelConflict,
  type ListingIntelDraft,
  type ListingIntelField,
  type ListingIntelReviewState,
  type ListingIntelSource,
} from "../listing-intelligence/index";

/* -------------------------------------------------------------------------- */
/* Source mapping                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Legacy `SellFieldSource` → canonical provenance.
 *
 * - USER_PROVIDED (explicit manual canonical-field entry) → USER_ENTERED
 *   (human-authoritative under the certified Phase A contract).
 * - TEXT / VOICE / COMBINED → USER_TEXT (AI-extracted from what the user said —
 *   NOT implicit confirmation).
 * - VISION → VISION.
 * - OCR_UNTRUSTED → DOCUMENT (untrusted media-derived content).
 */
export type LegacySellFieldSource =
  | "VISION"
  | "TEXT"
  | "VOICE"
  | "COMBINED"
  | "USER_PROVIDED"
  | "OCR_UNTRUSTED";

export function toCanonicalProvenance(
  source: LegacySellFieldSource
): ListingIntelSource {
  switch (source) {
    case "USER_PROVIDED":
      return "USER_ENTERED";
    case "VISION":
      return "VISION";
    case "OCR_UNTRUSTED":
      return "DOCUMENT";
    case "TEXT":
    case "VOICE":
    case "COMBINED":
      return "USER_TEXT";
    default:
      return "UNKNOWN";
  }
}

/** Sources that may never carry human authority through this adapter. */
const NON_HUMAN_SOURCES: ReadonlyArray<ListingIntelSource> = [
  "VISION",
  "DOCUMENT",
  "SCHEMA",
  "CONTEXT",
  "AI_INFERRED",
];

/* -------------------------------------------------------------------------- */
/* Producer-shape mappers                                                      */
/* -------------------------------------------------------------------------- */

/** A legacy `ExtractedField`-compatible producer shape (used by SellDraft). */
export type LegacyExtractedField<T> = {
  value: T | null;
  confidence: number | null;
  source: LegacySellFieldSource | ListingIntelSource;
  requiresConfirmation?: boolean;
  evidence?: string[];
};

/** A generic observed candidate (photo/document/schema/context/inference). */
export type ObservationCandidate<T> = {
  value: T | null;
  source: ListingIntelSource;
  /** Real numeric confidence when the provider supplies a calibrated one; null otherwise. */
  confidence?: number | null;
  /** Optional human-readable evidence (advisory, never authoritative). */
  evidence?: string[];
};

function canonicalSourceOf(candidate: ObservationCandidate<unknown> | LegacyExtractedField<unknown>): ListingIntelSource {
  const source = candidate.source;
  if (source === "USER_PROVIDED" || source === "TEXT" || source === "VOICE" ||
      source === "COMBINED" || source === "OCR_UNTRUSTED") {
    return toCanonicalProvenance(source);
  }
  return source;
}

/**
 * Convert a legacy extraction field (or a generic observation candidate) into
 * a canonical ListingIntelField. Confidence is normalized to the [0,1] rule —
 * invalid values become null (UNKNOWN) and can never authorize anything.
 */
export function toIntelField<T>(
  candidate: LegacyExtractedField<T> | ObservationCandidate<T>
): ListingIntelField<T> {
  const source = canonicalSourceOf(candidate);
  const confidence = normalizeIntelConfidence(candidate.confidence);
  // Only direct manual canonical-field entry may carry human authority.
  const humanAuthoritative = source === "USER_ENTERED";
  const reviewState = humanAuthoritative ? "HUMAN_CONFIRMED" : "AI_SUGGESTED";
  // Non-AI sources (manual entry) never force review; AI/context/media sources
  // require review whenever confidence is unknown or below the HIGH floor.
  const aiSourced = NON_HUMAN_SOURCES.includes(source) || source === "UNKNOWN";
  const requiresReview = aiSourced && (confidence === null || confidence < 0.9);
  return createIntelField({
    value: candidate.value ?? null,
    provenance: source,
    confidence,
    requiresReview,
    reviewState,
  });
}

/* -------------------------------------------------------------------------- */
/* Multi-source canonical merge                                                */
/* -------------------------------------------------------------------------- */

export type CanonicalMergeResult<T> = {
  field: ListingIntelField<T>;
  conflictCreated: boolean;
};

/**
 * Merge a single observed candidate into a canonical draft field. This is the
 * deterministic boundary where photo/document/user/schema/context evidence is
 * combined:
 * - A HUMAN_CONFIRMED / HUMAN_OVERRIDDEN field is never overwritten (the
 *   certified Phase A invariant), and an agreeing AI suggestion cannot dilute
 *   its provenance.
 * - Differing non-human values become an explicit conflict with the real field
 *   key — never silently resolved by higher confidence.
 * - Unknown confidence is never treated as certainty.
 */
export function mergeObservationIntoField<T>(
  fieldKey: string,
  existing: ListingIntelField<T> | undefined,
  candidate: ObservationCandidate<T>
): CanonicalMergeResult<T> {
  const incoming = toIntelField(candidate);
  return mergeAiSuggestion(fieldKey, existing, incoming);
}

export type DraftMergeResult = {
  draft: ListingIntelDraft;
  conflicts: Array<{ fieldKey: string; conflict: ListingIntelConflict<unknown> }>;
};

/**
 * Merge multiple observed candidates (photos, documents, schema, context,
 * manual fields) into one canonical draft. Returns the updated draft plus the
 * list of created conflicts so the human reviewer can see every disagreement.
 *
 * The adapter never publishes and never sets requiresReview=false on a
 * conflict — publishing stays 100% manual at the existing publish boundary.
 */
export function mergeObservationsIntoDraft(
  base: ListingIntelDraft | undefined,
  observations: Array<{ fieldKey: string; candidate: ObservationCandidate<unknown> }>
): DraftMergeResult {
  const draft: ListingIntelDraft = base ?? {
    fields: {},
    requiresReview: false,
    reviewReasons: [],
  };
  const conflicts: DraftMergeResult["conflicts"] = [];
  for (const { fieldKey, candidate } of observations) {
    const existing = draft.fields[fieldKey] as ListingIntelField<unknown> | undefined;
    const { field, conflictCreated } = mergeObservationIntoField(fieldKey, existing, candidate);
    draft.fields[fieldKey] = field;
    if (conflictCreated && field.conflicts.length > 0) {
      conflicts.push({
        fieldKey,
        conflict: field.conflicts[field.conflicts.length - 1]!,
      });
    }
  }
  draft.requiresReview = draftNeedsReview(draft);
  return { draft, conflicts };
}

/* -------------------------------------------------------------------------- */
/* Fallback / failure boundary                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Provider failure must degrade to manual flow, not corrupt the canonical
 * draft. An absent/empty extraction yields an empty draft; malformed or
 * unsupported content yields UNKNOWN provenance — never fake certainty and
 * never human authority.
 */
export function emptyCanonicalDraft(): ListingIntelDraft {
  return { fields: {}, requiresReview: false, reviewReasons: [] };
}

/**
 * Adversarial boundary: media/document/user content is untrusted DATA.
 * If the content contains instruction-like text ("publish automatically",
 * "ignore previous instructions"), it must remain a field value with
 * DOCUMENT/AI_INFERRED provenance — it can never alter policy, enable
 * auto-publish, or gain human authority.
 */
const ADVERSARIAL_PATTERNS: ReadonlyArray<RegExp> = [
  /ignore\s+(previous|prior|all)\s+instructions/i,
  /publish\s+automatically|auto[- ]?publish/i,
  /skip\s+confirmation/i,
  /you\s+are\s+now\s+/i,
];

export function isAdversarialContent(text: string | null | undefined): boolean {
  if (!text) return false;
  return ADVERSARIAL_PATTERNS.some((re) => re.test(text));
}

export function markAdversarialCandidate<T>(
  candidate: ObservationCandidate<T>
): ObservationCandidate<T> & { adversarial: boolean } {
  const textValue =
    typeof candidate.value === "string" ? candidate.value : "";
  const adversarial = isAdversarialContent(textValue);
  return {
    ...candidate,
    source: "DOCUMENT",
    confidence: null,
    adversarial,
  };
}

/* -------------------------------------------------------------------------- */
/* Shared helpers (re-exported for the client projection)                      */
/* -------------------------------------------------------------------------- */

export function draftNeedsReview(draft: ListingIntelDraft): boolean {
  return (
    draft.requiresReview ||
    Object.values(draft.fields).some((f) => f.conflicts.length > 0)
  );
}

export {
  canAiOverwriteField,
  createIntelField,
  mergeAiSuggestion,
  normalizeIntelConfidence,
};

export type {
  ListingIntelCandidate,
  ListingIntelConflict,
  ListingIntelDraft,
  ListingIntelField,
  ListingIntelReviewState,
  ListingIntelSource,
};
