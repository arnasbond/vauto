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
 *   - an independently verified value;
 *   - a trusted verification that changes the canonical value;
 *   - an explicit correction aimed at independently verified evidence.
 *
 * SECURITY SEMANTICS (do not weaken):
 *   - TRUSTED_VERIFICATION is SEMANTIC INPUT, NOT AUTHENTICATION. This pure
 *     contract cannot authenticate anything. It only consumes an
 *     ALREADY-AUTHENTICATED server-side verification result: the caller must
 *     perform real authentication upstream and then pass
 *     `authenticatedVerification: true`. A TypeScript string/enum is not a
 *     security boundary, and this contract must never be used as one.
 *   - A non-trusted source (USER_CLAIM, USER_CORRECTION,
 *     DOCUMENT_OBSERVATION, VISUAL_OBSERVATION, MODEL_INFERENCE,
 *     EXISTING_PERSISTED_VALUE) must NEVER mint or carry
 *     INDEPENDENTLY_VERIFIED. Such combinations fail closed.
 *
 * Hard semantic rules (encoded below, not comments-only):
 *   1. A persisted value is NEVER automatically verified.
 *   2. A canonical normalized value is NEVER automatically verified.
 *   3. Human confirmation creates a HUMAN_CONFIRMED claim, not verification.
 *   4. Only an authenticated TRUSTED_VERIFICATION may produce
 *      INDEPENDENTLY_VERIFIED.
 *   5. An explicit USER_CORRECTION may replace an earlier claim/observation/
 *      inference without manufacturing a conflict, while retaining auditable
 *      evidence history.
 *   6. Two materially different credible values from different evidence
 *      sources produce CONFLICT unless an explicit correction or trusted
 *      verification resolves them.
 *   7. MODEL_INFERENCE alone never silently overwrites a user claim,
 *      document observation, human-confirmed value or trusted verification.
 *   8. VISUAL_OBSERVATION is an observation, never a verified fact.
 *   9. Unknown source/status values and invalid source/status combinations
 *      fail closed.
 *  10. No input is ever mutated; no output shares mutable object identity
 *      with any input; history is cumulative (never rebuilt from the latest
 *      pair alone).
 *  11. No marketplace category receives source precedence because of its
 *      vertical — this contract has no vertical knowledge at all. There is
 *      NO universal source-strength hierarchy: evidence quality is decided
 *      by the semantics above, not by numeric ranking.
 *  12. History is retained so a future UI can explain what was understood,
 *      where it came from, what conflicts and what remains uncertain.
 *
 * Category-neutral means: no VIN, vehicle, real-estate, electronics, clothing,
 * services, jobs, home or any other vertical-specific rule exists here.
 * Normalization is deliberately OUTSIDE this contract — callers must supply
 * already-normalized `value` strings; identical normalized values compare as
 * SAME_VALUE regardless of how they were spelled or sourced.
 */

/** Where a value came from. Order here carries NO precedence. */
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
  | "REJECT_UNSUPPORTED_INFERENCE"
  | "ACCEPT_VERIFICATION"
  | "REQUIRES_REVERIFICATION";

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
  /** Caller-normalized canonical string form of the value (non-empty string). */
  value: string;
  source: FactEvidenceSource;
  status: FactEvidenceStatus;
  /** Opaque provenance note (label id, document name…) — never parsed here. */
  reason?: string;
  /** Epoch ms when the evidence was created; optional so tests stay deterministic. */
  at?: number;
}

/**
 * Immutable cumulative evidence state: the current canonical record plus the
 * COMPLETE evidence history. Every evaluation receives this state and returns
 * a NEW state that appends to the previous history — history is never rebuilt
 * from the latest pair alone.
 */
export interface FactEvidenceState {
  canonical: FactEvidence | null;
  history: readonly FactEvidence[];
}

export interface EvaluateFactEvidenceOptions {
  /** Explicit correction intent — never inferred from a differing value. */
  isExplicitCorrection?: boolean;
  /** The human explicitly confirmed this value — yields HUMAN_CONFIRMED, not verified. */
  isHumanConfirmation?: boolean;
  /**
   * The caller declares that the TRUSTED_VERIFICATION result was authenticated
   * by a REAL server-side verification boundary BEFORE this call. This pure
   * contract performs no authentication itself; without this flag a
   * TRUSTED_VERIFICATION source fails closed.
   */
  authenticatedVerification?: boolean;
  /** Epoch ms stamp for the incoming record; omitted by default for determinism. */
  nowMs?: number;
}

export interface FactEvidenceDecisionResult {
  decision: FactDecision;
  /** The NEW cumulative state (canonical + full history). Never shares identity with inputs. */
  state: FactEvidenceState;
  /** The competing evidence when the decision is CONFLICT. */
  conflictWith?: FactEvidence;
  /** Human-readable reason for the decision (stable for tests and future UI). */
  reason: string;
}

function isKnownSource(value: unknown): value is FactEvidenceSource {
  return typeof value === "string" && (FACT_EVIDENCE_SOURCES as readonly string[]).includes(value);
}

function isKnownStatus(value: unknown): value is FactEvidenceStatus {
  return typeof value === "string" && (FACT_EVIDENCE_STATUSES as readonly string[]).includes(value);
}

function cloneEvidence(e: FactEvidence): FactEvidence {
  const out: FactEvidence = { value: e.value, source: e.source, status: e.status };
  if (e.reason !== undefined) out.reason = e.reason;
  if (e.at !== undefined) out.at = e.at;
  return out;
}

/** Same normalized value = identical non-empty strings. */
function sameValue(a: FactEvidence, b: FactEvidence): boolean {
  return a.value === b.value;
}

/**
 * Structural validity of ONE evidence record, including the source/status
 * combination rule: only TRUSTED_VERIFICATION may carry
 * INDEPENDENTLY_VERIFIED.
 */
function isValidEvidenceShape(raw: unknown): raw is FactEvidence {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const e = raw as Partial<FactEvidence>;
  if (typeof e.value !== "string" || e.value.trim() === "") return false;
  if (!isKnownSource(e.source)) return false;
  if (!isKnownStatus(e.status)) return false;
  const source = e.source as FactEvidenceSource;
  const status = e.status as FactEvidenceStatus;
  if (source !== "TRUSTED_VERIFICATION" && status === "INDEPENDENTLY_VERIFIED") return false;
  if (source === "TRUSTED_VERIFICATION" && status !== "INDEPENDENTLY_VERIFIED") return false;
  return true;
}

/**
 * Sanitize an input state: drop malformed history entries and treat a
 * malformed canonical record as absent — corrupted evidence can never become
 * authority. Always returns freshly built arrays (no shared identity).
 */
function sanitizeState(raw: FactEvidenceState | null): FactEvidenceState {
  if (raw == null) return { canonical: null, history: [] };
  const history: FactEvidence[] = [];
  const seen = new Set<FactEvidence>();
  if (Array.isArray(raw.history)) {
    for (const entry of raw.history) {
      if (!isValidEvidenceShape(entry)) continue;
      if (seen.has(entry)) continue;
      seen.add(entry);
      history.push(cloneEvidence(entry));
    }
  }
  const canonical = isValidEvidenceShape(raw.canonical) ? cloneEvidence(raw.canonical) : null;
  return { canonical, history };
}

interface ValidatedIncoming {
  evidence: FactEvidence;
  invalidReason?: string;
}

function validateIncoming(
  incoming: unknown,
  options: EvaluateFactEvidenceOptions
): ValidatedIncoming {
  if (incoming == null || typeof incoming !== "object" || Array.isArray(incoming)) {
    return { evidence: null as unknown as FactEvidence, invalidReason: "incoming evidence is not an object" };
  }
  const e = incoming as Partial<FactEvidence>;
  if (typeof e.value !== "string") {
    return { evidence: null as unknown as FactEvidence, invalidReason: "incoming value is not a string" };
  }
  if (e.value.trim() === "") {
    return { evidence: null as unknown as FactEvidence, invalidReason: "incoming value is empty" };
  }
  if (!isKnownSource(e.source)) {
    return { evidence: null as unknown as FactEvidence, invalidReason: `unknown evidence source: ${String(e.source)}` };
  }
  if (!isKnownStatus(e.status)) {
    return { evidence: null as unknown as FactEvidence, invalidReason: `unknown evidence status: ${String(e.status)}` };
  }
  const source = e.source as FactEvidenceSource;
  const status = e.status as FactEvidenceStatus;
  if (source === "TRUSTED_VERIFICATION") {
    if (options.authenticatedVerification !== true) {
      return {
        evidence: null as unknown as FactEvidence,
        invalidReason: "trusted verification requires an authenticated verification result",
      };
    }
    if (status !== "INDEPENDENTLY_VERIFIED") {
      return {
        evidence: null as unknown as FactEvidence,
        invalidReason: "trusted verification must carry INDEPENDENTLY_VERIFIED status",
      };
    }
  } else if (status === "INDEPENDENTLY_VERIFIED") {
    return {
      evidence: null as unknown as FactEvidence,
      invalidReason: `source ${source} must never carry INDEPENDENTLY_VERIFIED`,
    };
  }
  if (options.isExplicitCorrection && source !== "USER_CLAIM") {
    return {
      evidence: null as unknown as FactEvidence,
      invalidReason: "an explicit correction must be a user claim",
    };
  }
  // Effective status is derived ONLY from legitimate transitions:
  // human confirmation via the explicit flag, verification via authenticated
  // TRUSTED_VERIFICATION. Arbitrary incoming status never upgrades anything.
  const effectiveStatus: FactEvidenceStatus =
    source === "TRUSTED_VERIFICATION"
      ? "INDEPENDENTLY_VERIFIED"
      : options.isHumanConfirmation
        ? "HUMAN_CONFIRMED"
        : "UNCONFIRMED";
  const evidence: FactEvidence = {
    value: e.value,
    source: options.isExplicitCorrection ? "USER_CORRECTION" : source,
    status: effectiveStatus,
    ...(typeof e.reason === "string" && e.reason.trim() !== "" ? { reason: e.reason } : {}),
    ...(options.nowMs != null ? { at: options.nowMs } : {}),
  };
  return { evidence };
}

function buildResult(
  decision: FactDecision,
  canonical: FactEvidence | null,
  history: readonly FactEvidence[],
  reason: string,
  conflictWith?: FactEvidence
): FactEvidenceDecisionResult {
  const out: FactEvidenceDecisionResult = {
    decision,
    state: { canonical, history },
    reason,
  };
  if (conflictWith) out.conflictWith = conflictWith;
  return out;
}

/**
 * Pure decision function over an immutable cumulative state.
 *
 * `state` (or null) is the previous evidence state; `incoming` is the new
 * evidence; options carry the only legitimate transition signals. Returns a
 * NEW state whose history is the previous history plus the incoming evidence.
 * Never mutates any input; never touches the clock unless `nowMs` is supplied;
 * never knows a category or a field; performs NO authentication.
 */
export function evaluateFactEvidence(
  state: FactEvidenceState | null,
  incoming: unknown,
  options: EvaluateFactEvidenceOptions = {}
): FactEvidenceDecisionResult {
  const prior = sanitizeState(state);

  const validated = validateIncoming(incoming, options);
  if (validated.invalidReason) {
    // Fail closed: nothing from the rejected evidence may become canonical,
    // and the incoming value is not even worth recording as considered evidence.
    return buildResult(
      "REJECT_UNSUPPORTED_INFERENCE",
      prior.canonical,
      prior.history,
      validated.invalidReason
    );
  }
  const inc = validated.evidence;
  const historyWithIncoming: readonly FactEvidence[] = [...prior.history, inc];

  const current = prior.canonical;

  if (!current) {
    if (inc.source === "MODEL_INFERENCE") {
      // Rule 7/8: unsupported inference alone cannot establish a canonical value.
      return buildResult("INSUFFICIENT_EVIDENCE", null, historyWithIncoming,
        "model inference alone cannot establish a canonical value");
    }
    if (inc.source === "TRUSTED_VERIFICATION") {
      // Rule 4: an authenticated trusted verification establishes a verified value.
      return buildResult("ACCEPT_VERIFICATION", inc, historyWithIncoming,
        "first evidence is an independently verified value");
    }
    // First credible evidence becomes the canonical value; the decision name
    // reflects that the resulting canonical equals the incoming normalized
    // value by construction.
    return buildResult("SAME_VALUE", inc, historyWithIncoming, "first evidence for this field");
  }

  // Rule 4: an authenticated trusted verification always supersedes, and is
  // the only path to INDEPENDENTLY_VERIFIED.
  if (inc.source === "TRUSTED_VERIFICATION") {
    if (sameValue(current, inc)) {
      const upgraded: FactEvidence = { ...current, status: "INDEPENDENTLY_VERIFIED" };
      return buildResult("SAME_VALUE", upgraded, historyWithIncoming,
        "trusted verification upgrades the same normalized value");
    }
    return buildResult("ACCEPT_VERIFICATION", inc, historyWithIncoming,
      "trusted verification changes the canonical value — prior evidence retained in history");
  }

  // Identical normalized values: the existing canonical value is preserved and
  // the new evidence is appended to history. Status may upgrade ONLY through
  // legitimate transitions (the explicit human-confirmation flag here).
  if (sameValue(current, inc)) {
    const upgradedStatus: FactEvidenceStatus =
      options.isHumanConfirmation && current.status !== "INDEPENDENTLY_VERIFIED"
        ? "HUMAN_CONFIRMED"
        : current.status;
    const merged: FactEvidence = { ...current, status: upgradedStatus };
    return buildResult("SAME_VALUE", merged, historyWithIncoming,
      "same supporting value from a new source");
  }

  // Rule 4/6: an explicit human correction may never silently displace an
  // independently verified value — both values and their provenance are
  // preserved and the correction demands re-verification.
  if (options.isExplicitCorrection && current.status === "INDEPENDENTLY_VERIFIED") {
    return buildResult("REQUIRES_REVERIFICATION", current, historyWithIncoming,
      "an explicit correction cannot displace independently verified evidence — re-verification required");
  }

  // Rule 5: an explicit correction replaces the value without manufacturing a
  // conflict; the replaced value stays in history.
  if (options.isExplicitCorrection) {
    return buildResult("ACCEPT_CORRECTION", inc, historyWithIncoming,
      "explicit correction accepted");
  }

  // Rule 7/8: a model inference never silently overwrites existing evidence.
  if (inc.source === "MODEL_INFERENCE") {
    return buildResult("REJECT_UNSUPPORTED_INFERENCE", current, historyWithIncoming,
      "unsupported inference cannot overwrite existing evidence");
  }

  // Rule 6: two materially different credible values conflict — the existing
  // canonical stays, the challenger is recorded.
  return buildResult("CONFLICT", current, historyWithIncoming,
    "competing credible evidence", inc);
}
