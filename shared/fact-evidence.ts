/**
 * VAUTO — Universal Fact-Evidence Contract (North Star §6).
 *
 * A pure, category-neutral and field-key-neutral contract that represents a
 * marketplace field value together with its evidence state, and that can
 * deterministically distinguish:
 *   - same supporting value;
 *   - explicit correction;
 *   - competing evidence requiring a conflict;
 *   - unsupported inference;
 *   - insufficient evidence;
 *   - a human-confirmed claim;
 *   - an independently verified value.
 *
 * Hard semantic rules (encoded below, not comments-only):
 *   1. A persisted value is NEVER automatically verified.
 *   2. A canonical normalized value is NEVER automatically verified.
 *   3. Human confirmation creates a HUMAN_CONFIRMED claim, not verification.
 *   4. Only TRUSTED_VERIFICATION may produce INDEPENDENTLY_VERIFIED.
 *   5. An explicit USER_CORRECTION may replace an earlier claim/observation/
 *      inference without manufacturing a conflict, while retaining auditable
 *      evidence history.
 *   6. Two materially different credible values from different evidence
 *      sources produce CONFLICT unless an explicit correction or trusted
 *      verification resolves them.
 *   7. MODEL_INFERENCE alone never silently overwrites a user claim,
 *      document observation, human-confirmed value or trusted verification.
 *   8. VISUAL_OBSERVATION is an observation, never a verified fact.
 *   9. Unknown source/status values fail closed.
 *  10. No input is ever mutated.
 *  11. No marketplace category receives source precedence because of its
 *      vertical — this contract has no vertical knowledge at all.
 *  12. History is retained so a future UI can explain what was understood,
 *      where it came from, what conflicts and what remains uncertain.
 *
 * Category-neutral means: no VIN, vehicle, real-estate, electronics, clothing,
 * services, jobs, home or any other vertical-specific rule exists here.
 * Normalization is deliberately OUTSIDE this contract — callers must supply
 * already-normalized `value` strings; identical normalized values compare as
 * SAME_VALUE regardless of how they were spelled or sourced.
 */

/** Where a value came from. Order here is NOT precedence — see the rules. */
export type FactEvidenceSource =
  | "USER_CLAIM"
  | "USER_CORRECTION"
  | "DOCUMENT_OBSERVATION"
  | "VISUAL_OBSERVATION"
  | "MODEL_INFERENCE"
  | "EXISTING_PERSISTED_VALUE"
  | "TRUSTED_VERIFICATION";

/** What authority a value currently carries. */
export type FactEvidenceStatus =
  | "UNCONFIRMED"
  | "HUMAN_CONFIRMED"
  | "INDEPENDENTLY_VERIFIED";

/** The deterministic decision the contract produces. */
export type FactDecision =
  | "SAME_VALUE"
  | "ACCEPT_CORRECTION"
  | "CONFLICT"
  | "INSUFFICIENT_EVIDENCE"
  | "REJECT_UNSUPPORTED_INFERENCE";

export const FACT_EVIDENCE_SOURCES: readonly FactEvidenceSource[] = [
  "USER_CLAIM",
  "USER_CORRECTION",
  "DOCUMENT_OBSERVATION",
  "VISUAL_OBSERVATION",
  "MODEL_INFERENCE",
  "EXISTING_PERSISTED_VALUE",
  "TRUSTED_VERIFICATION",
];

export const FACT_EVIDENCE_STATUSES: readonly FactEvidenceStatus[] = [
  "UNCONFIRMED",
  "HUMAN_CONFIRMED",
  "INDEPENDENTLY_VERIFIED",
];

/** A single evidence record for one field value. Immutable by convention. */
export interface FactEvidence {
  /** Caller-normalized canonical string form of the value. */
  value: string;
  source: FactEvidenceSource;
  status: FactEvidenceStatus;
  /** Opaque provenance note (label id, document name…) — never parsed here. */
  reason?: string;
  /** Epoch ms when the evidence was created; optional so tests stay deterministic. */
  at?: number;
}

export interface EvaluateFactEvidenceOptions {
  /** Explicit correction intent — the caller must signal it; it is never inferred from a differing value. */
  isExplicitCorrection?: boolean;
  /** The human explicitly confirmed this value — yields HUMAN_CONFIRMED, not verified. */
  isHumanConfirmation?: boolean;
  /** Epoch ms stamp for the incoming record; omitted by default for determinism. */
  nowMs?: number;
}

export interface FactEvidenceDecisionResult {
  decision: FactDecision;
  /** Resulting canonical evidence record, or null when nothing may be stored canonically. */
  record: FactEvidence | null;
  /** The competing evidence when the decision is CONFLICT. */
  conflictWith?: FactEvidence;
  /** Append-only evidence chain (never mutated; shares nothing with inputs). */
  history: readonly FactEvidence[];
  /** Human-readable reason for the decision (stable for tests and future UI). */
  reason: string;
}

function isKnownSource(value: unknown): value is FactEvidenceSource {
  return typeof value === "string" && (FACT_EVIDENCE_SOURCES as readonly string[]).includes(value);
}

function isKnownStatus(value: unknown): value is FactEvidenceStatus {
  return typeof value === "string" && (FACT_EVIDENCE_STATUSES as readonly string[]).includes(value);
}

/** Two caller-normalized values are the same when their strings match exactly. */
function sameValue(a: FactEvidence, b: FactEvidence): boolean {
  return a.value === b.value;
}

/** Universal evidence-quality order (category-neutral). Higher = stronger evidence kind. */
const SOURCE_STRENGTH: Record<FactEvidenceSource, number> = {
  MODEL_INFERENCE: 0,
  VISUAL_OBSERVATION: 1,
  DOCUMENT_OBSERVATION: 2,
  EXISTING_PERSISTED_VALUE: 3,
  USER_CLAIM: 4,
  USER_CORRECTION: 5,
  TRUSTED_VERIFICATION: 6,
};

/** Universal status order (category-neutral). */
const STATUS_STRENGTH: Record<FactEvidenceStatus, number> = {
  UNCONFIRMED: 0,
  HUMAN_CONFIRMED: 1,
  INDEPENDENTLY_VERIFIED: 2,
};

/** Stronger of two statuses (never downgrades). */
function strongestStatus(a: FactEvidenceStatus, b: FactEvidenceStatus): FactEvidenceStatus {
  return STATUS_STRENGTH[a] >= STATUS_STRENGTH[b] ? a : b;
}

function result(
  decision: FactDecision,
  record: FactEvidence | null,
  history: readonly FactEvidence[],
  reason: string,
  conflictWith?: FactEvidence
): FactEvidenceDecisionResult {
  const out: FactEvidenceDecisionResult = { decision, record, history, reason };
  if (conflictWith) out.conflictWith = conflictWith;
  return out;
}

/**
 * Pure decision function. Never mutates `current` or `incoming`; never touches
 * the clock (unless `nowMs` is supplied); never knows a category or a field.
 *
 * Fail-closed contract: unknown source or unknown status of the INCOMING
 * evidence is rejected (REJECT_UNSUPPORTED_INFERENCE with an explicit reason).
 * An unknown source/status on the CURRENT record makes it untrusted: it is
 * treated as absent so it cannot block or confirm anything.
 */
export function evaluateFactEvidence(
  current: FactEvidence | null,
  incoming: FactEvidence,
  options: EvaluateFactEvidenceOptions = {}
): FactEvidenceDecisionResult {
  // Fail closed on malformed incoming evidence.
  if (!isKnownSource(incoming.source)) {
    return result(
      "REJECT_UNSUPPORTED_INFERENCE",
      current,
      current ? [current] : [],
      `unknown evidence source: ${String(incoming.source)}`
    );
  }
  if (!isKnownStatus(incoming.status)) {
    return result(
      "REJECT_UNSUPPORTED_INFERENCE",
      current,
      current ? [current] : [],
      `unknown evidence status: ${String(incoming.status)}`
    );
  }

  const incomingEvidence: FactEvidence = {
    value: incoming.value,
    source: options.isExplicitCorrection ? "USER_CORRECTION" : incoming.source,
    status: options.isHumanConfirmation
      ? strongestStatus(incoming.status, "HUMAN_CONFIRMED")
      : incoming.status,
    ...(incoming.reason ? { reason: incoming.reason } : {}),
    ...(options.nowMs != null ? { at: options.nowMs } : {}),
  };

  // Fail closed on malformed current evidence — treat as absent, never as authority.
  const safeCurrent =
    current && isKnownSource(current.source) && isKnownStatus(current.status) ? current : null;

  if (!safeCurrent) {
    if (incomingEvidence.source === "MODEL_INFERENCE") {
      // Rule 7/8: unsupported inference alone cannot establish a canonical value.
      return result(
        "INSUFFICIENT_EVIDENCE",
        null,
        [incomingEvidence],
        "model inference alone cannot establish a canonical value"
      );
    }
    if (incomingEvidence.source === "TRUSTED_VERIFICATION") {
      // Rule 4: trusted verification is the only path to verified status.
      return result("SAME_VALUE", { ...incomingEvidence, status: "INDEPENDENTLY_VERIFIED" }, [incomingEvidence], "first evidence is independently verified");
    }
    return result("SAME_VALUE", incomingEvidence, [incomingEvidence], "first evidence for this field");
  }

  // Rule 4: a new trusted verification always wins and always verifies.
  if (incomingEvidence.source === "TRUSTED_VERIFICATION") {
    const verified: FactEvidence = { ...incomingEvidence, status: "INDEPENDENTLY_VERIFIED" };
    return result("SAME_VALUE", verified, [safeCurrent, verified], "trusted verification supersedes prior evidence");
  }

  // Identical caller-normalized values merge evidence without conflict.
  if (sameValue(safeCurrent, incomingEvidence)) {
    const merged: FactEvidence = {
      ...(SOURCE_STRENGTH[incomingEvidence.source] >= SOURCE_STRENGTH[safeCurrent.source]
        ? incomingEvidence
        : safeCurrent),
      status: strongestStatus(safeCurrent.status, incomingEvidence.status),
      ...(safeCurrent.reason && !incomingEvidence.reason ? { reason: safeCurrent.reason } : {}),
    };
    return result("SAME_VALUE", merged, [safeCurrent, incomingEvidence], "same supporting value from a new source");
  }

  // Explicit correction replaces the value without manufacturing a conflict
  // (rule 5). Replacing an INDEPENDENTLY_VERIFIED value is allowed ONLY when
  // the correction is explicit — and the new value becomes a human claim, never
  // re-verified; the verified evidence stays in history for audit.
  if (options.isExplicitCorrection) {
    const corrected: FactEvidence = { ...incomingEvidence, source: "USER_CORRECTION" };
    return result(
      "ACCEPT_CORRECTION",
      corrected,
      [safeCurrent, corrected],
      safeCurrent.status === "INDEPENDENTLY_VERIFIED"
        ? "explicit correction replaces a verified value — the new value is a human claim, not verified"
        : "explicit correction accepted"
    );
  }

  // Rule 7/8: a model inference or visual observation never silently
  // overwrites any existing credible evidence.
  if (incomingEvidence.source === "MODEL_INFERENCE") {
    return result(
      "REJECT_UNSUPPORTED_INFERENCE",
      safeCurrent,
      [safeCurrent, incomingEvidence],
      "unsupported inference cannot overwrite existing evidence"
    );
  }

  // Rule 6: two materially different credible values from different sources
  // conflict — the existing value stays canonical, the challenger is recorded.
  return result(
    "CONFLICT",
    safeCurrent,
    [safeCurrent, incomingEvidence],
    "competing credible evidence",
    incomingEvidence
  );
}
