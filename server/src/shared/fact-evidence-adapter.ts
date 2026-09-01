/**
 * VAUTO — Fact-Evidence Adapter (F2.1).
 *
 * A single, category-neutral and field-key-neutral adapter that maps the EXISTING
 * producer source vocabularies — the server `ExtractedField` / `SellFieldSource`
 * shape and the canonical `ListingIntelSource` provenance — into the universal
 * `FactEvidenceSource` vocabulary and delegates EVERY decision to
 * `evaluateFactEvidence` (shared/fact-evidence.ts). Fact-evidence is the decision
 * authority; this adapter only translates vocabulary, never adds a third model.
 *
 * Bounded guarantees (do not weaken):
 *   - Pure deterministic mapper: NO model calls, NO authentication, NO
 *     persistence, NO category logic, NO vertical knowledge.
 *   - NEVER mints TRUSTED_VERIFICATION or INDEPENDENTLY_VERIFIED. A trusted
 *     verification only ever enters through an explicit pass-through whose
 *     caller supplies `authenticatedVerification: true` — and the contract
 *     rejects it otherwise. This adapter performs no authentication itself.
 *   - Human confirmation is derived ONLY from explicit manual canonical-field
 *     entry (`USER_PROVIDED` / `USER_ENTERED`). VISION / DOCUMENT / SCHEMA /
 *     CONTEXT / AI_INFERRED / COMBINED / UNKNOWN never gain human authority.
 *   - Values are stringified mechanically WITHOUT semantic normalization:
 *     `"62 m²"` and `"62m2"` are different facts (CONFLICT), while `"62"` and
 *     `"62"` are SAME_VALUE. Normalization remains the caller's responsibility
 *     (the contract is byte-equal on the supplied string).
 *   - Unknown sources and unstringifiable values fail closed to `null` (no
 *     evidence), so they can never become authority or manufacture certainty.
 */

import {
  evaluateFactEvidence,
  type EvaluateFactEvidenceOptions,
  type FactEvidence,
  type FactEvidenceDecisionResult,
  type FactEvidenceSource,
  type FactEvidenceState,
} from "./fact-evidence.js";

/* -------------------------------------------------------------------------- */
/* Source mapping                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Producer source vocabularies accepted by this adapter:
 *   - the server sell `SellFieldSource` (VISION / TEXT / VOICE / COMBINED /
 *     USER_PROVIDED / OCR_UNTRUSTED), and
 *   - the canonical `ListingIntelSource` (USER_TEXT / USER_ENTERED / VISION /
 *     DOCUMENT / SCHEMA / CONTEXT / AI_INFERRED / UNKNOWN).
 * FactEvidenceSource values are also accepted verbatim (idempotent pass-through).
 */
export type FactEvidenceProducerSource =
  | "VISION"
  | "TEXT"
  | "VOICE"
  | "COMBINED"
  | "USER_PROVIDED"
  | "OCR_UNTRUSTED"
  | "USER_TEXT"
  | "USER_ENTERED"
  | "DOCUMENT"
  | "SCHEMA"
  | "CONTEXT"
  | "AI_INFERRED"
  | "UNKNOWN";

/**
 * Map a producer source (or an already-canonical FactEvidenceSource) into a
 * FactEvidenceSource. Returns `null` for any unrecognized source — fail closed,
 * never invent a source.
 *
 * Mapping (deterministic, no category knowledge):
 *   - USER_PROVIDED / USER_ENTERED / TEXT / VOICE / USER_TEXT → USER_CLAIM
 *     (a value the human stated or entered; USER_PROVIDED/USER_ENTERED further
 *     carry human confirmation via the evaluation flag, never verification).
 *   - VISION → VISUAL_OBSERVATION (an observation, never a verified fact).
 *   - OCR_UNTRUSTED / DOCUMENT → DOCUMENT_OBSERVATION (untrusted media text).
 *   - COMBINED / SCHEMA / CONTEXT / AI_INFERRED / UNKNOWN → MODEL_INFERENCE
 *     (derived/combined or unknown provenance; inference alone can never
 *     establish a canonical value or overwrite existing evidence).
 */
export function toFactEvidenceSource(source: string): FactEvidenceSource | null {
  switch (source) {
    case "USER_PROVIDED":
    case "USER_ENTERED":
    case "TEXT":
    case "VOICE":
    case "USER_TEXT":
      return "USER_CLAIM";
    case "VISION":
      return "VISUAL_OBSERVATION";
    case "OCR_UNTRUSTED":
    case "DOCUMENT":
      return "DOCUMENT_OBSERVATION";
    case "COMBINED":
    case "SCHEMA":
    case "CONTEXT":
    case "AI_INFERRED":
    case "UNKNOWN":
      return "MODEL_INFERENCE";
    case "USER_CLAIM":
    case "USER_CORRECTION":
    case "DOCUMENT_OBSERVATION":
    case "VISUAL_OBSERVATION":
    case "MODEL_INFERENCE":
    case "EXISTING_PERSISTED_VALUE":
    case "TRUSTED_VERIFICATION":
      return source;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Value stringification (normalization boundary)                              */
/* -------------------------------------------------------------------------- */

/**
 * Mechanical, deterministic stringification of a producer value into the
 * caller-normalized string the contract consumes. This is the NORMALIZATION
 * BOUNDARY: the adapter does NOT trim, case-fold, unit-convert, or otherwise
 * semantically normalize — it only turns a primitive into a stable string.
 * `null` / `undefined` / empty-string / non-finite numbers / unstringifiable
 * objects yield `null` (no evidence). Objects are JSON-stringified when possible.
 */
export function stringifyFactValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length === 0 ? null : value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  try {
    const json = JSON.stringify(value);
    return json === undefined ? null : json;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Producer-shape mapping                                                      */
/* -------------------------------------------------------------------------- */

/** A producer field compatible with `ExtractedField` / `ObservationCandidate`. */
export type FactEvidenceProducerField<T = unknown> = {
  value: T | null;
  /** SellFieldSource | ListingIntelSource | FactEvidenceSource. */
  source: string;
  confidence?: number | null;
  requiresConfirmation?: boolean;
  evidence?: string[];
};

export type EvaluateFieldEvidenceOptions = {
  /** Explicit human correction intent — never inferred from a differing value. */
  isExplicitCorrection?: boolean;
  /**
   * The caller declares a real server-side authentication boundary already
   * verified a TRUSTED_VERIFICATION result. Without this, a TRUSTED_VERIFICATION
   * source fails closed inside evaluateFactEvidence.
   */
  authenticatedVerification?: boolean;
  /** Epoch ms stamp; omitted by default for deterministic tests. */
  nowMs?: number;
};

/**
 * Map a producer field into a single `FactEvidence` record (or `null` when the
 * field carries no representable evidence). Does NOT evaluate — use
 * `evaluateFieldEvidence` for the full decision. Status is set to a valid
 * placeholder; the effective authority is derived by evaluateFactEvidence from
 * the source and the evaluation flags, never from this record alone.
 */
export function toFactEvidence<T>(
  field: FactEvidenceProducerField<T>,
  options: EvaluateFieldEvidenceOptions = {}
): FactEvidence | null {
  if (field == null || typeof field !== "object") return null;
  const value = stringifyFactValue(field.value);
  if (value === null) return null;
  const source = toFactEvidenceSource(field.source);
  if (source === null) return null;
  const reason =
    field.evidence && field.evidence.length > 0
      ? field.evidence.join("; ")
      : undefined;
  const status: FactEvidence["status"] =
    source === "TRUSTED_VERIFICATION" ? "INDEPENDENTLY_VERIFIED" : "UNCONFIRMED";
  return {
    value,
    source,
    status,
    ...(reason !== undefined ? { reason } : {}),
    ...(options.nowMs != null ? { at: options.nowMs } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Decision boundary                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Map a producer field into fact-evidence and evaluate it against a prior state,
 * delegating the decision to `evaluateFactEvidence`. Returns `null` only when the
 * field carries no representable evidence (unknown source / empty value) — the
 * caller treats that as "no evidence", never as authority.
 *
 * Human confirmation is derived ONLY from explicit manual entry
 * (USER_PROVIDED / USER_ENTERED) and is passed as the legitimate transition flag;
 * every other source stays UNCONFIRMED. Explicit correction and authenticated
 * verification pass through unchanged.
 */
export function evaluateFieldEvidence(
  state: FactEvidenceState | null,
  field: FactEvidenceProducerField<unknown>,
  options: EvaluateFieldEvidenceOptions = {}
): FactEvidenceDecisionResult | null {
  const evidence = toFactEvidence(field, options);
  if (evidence === null) return null;
  const isHumanConfirmation =
    field.source === "USER_PROVIDED" || field.source === "USER_ENTERED";
  const evalOptions: EvaluateFactEvidenceOptions = {
    isExplicitCorrection: options.isExplicitCorrection,
    isHumanConfirmation,
    authenticatedVerification: options.authenticatedVerification,
    nowMs: options.nowMs,
  };
  return evaluateFactEvidence(state, evidence, evalOptions);
}

export type {
  EvaluateFactEvidenceOptions,
  FactEvidence,
  FactEvidenceDecisionResult,
  FactEvidenceSource,
  FactEvidenceState,
};
