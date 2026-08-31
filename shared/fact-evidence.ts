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
 *   - an explicit correction aimed at independently verified evidence;
 *   - first evidence establishing a canonical value;
 *   - malformed prior state requiring reconstruction.
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
 *     INDEPENDENTLY_VERIFIED. Such combinations are invalid.
 *
 * STATE INVARIANTS (enforced, not just documented):
 *   - A non-null prior state must be VALID: malformed canonical, malformed
 *     history entry, a canonical/history mismatch, or a non-trusted
 *     independently-verified record anywhere yields the explicit
 *     INVALID_STATE decision — corrupted evidence is never silently reset
 *     and can never become authority.
 *   - Every non-null canonical record must be represented in the cumulative
 *     history (same value + same source).
 *   - Every returned state is itself valid input for the next evaluation
 *     (state-machine closure).
 *
 * IMMUTABILITY (enforced, not just documented):
 *   - `FactEvidence` and `FactEvidenceState` properties are readonly.
 *   - No returned record, history array, state or result shares mutable
 *     identity with any input or with another logical slot in the output —
 *     canonical, history entries and `conflictWith` are separate defensive
 *     clones.
 *   - All returned evidence records, history arrays, state objects and the
 *     result object are frozen at runtime.
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
 *      fail closed; a malformed prior state fails closed with INVALID_STATE.
 *  10. No input is ever mutated; no output shares mutable identity with any
 *      input; history is cumulative and append-only (every valid evidence
 *      event is preserved in order, even when the caller reuses the same
 *      object reference).
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
  | "ACCEPT_EVIDENCE"
  | "ACCEPT_CORRECTION"
  | "CONFLICT"
  | "INSUFFICIENT_EVIDENCE"
  | "REJECT_UNSUPPORTED_INFERENCE"
  | "ACCEPT_VERIFICATION"
  | "REQUIRES_REVERIFICATION"
  | "INVALID_STATE";

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

/** A single evidence record for one field value. Readonly + frozen at runtime. */
export interface FactEvidence {
  /** Caller-normalized canonical string form of the value (non-empty string). */
  readonly value: string;
  readonly source: FactEvidenceSource;
  readonly status: FactEvidenceStatus;
  /** Opaque provenance note (label id, document name…) — never parsed here. */
  readonly reason?: string;
  /** Epoch ms when the evidence was created; optional so tests stay deterministic. */
  readonly at?: number;
}

/**
 * Immutable cumulative evidence state: the current canonical record plus the
 * COMPLETE evidence history. Readonly + frozen at runtime. Every evaluation
 * receives this state and returns a NEW state that appends to the previous
 * history — history is never rebuilt from the latest pair alone.
 */
export interface FactEvidenceState {
  readonly canonical: FactEvidence | null;
  readonly history: readonly FactEvidence[];
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
  readonly decision: FactDecision;
  /** The NEW cumulative state (canonical + full history). Never shares identity with inputs. */
  readonly state: FactEvidenceState;
  /** The competing evidence when the decision is CONFLICT (separate frozen clone). */
  readonly conflictWith?: FactEvidence;
  /** Human-readable reason for the decision (stable for tests and future UI). */
  readonly reason: string;
}

function isKnownSource(value: unknown): value is FactEvidenceSource {
  return typeof value === "string" && (FACT_EVIDENCE_SOURCES as readonly string[]).includes(value);
}

function isKnownStatus(value: unknown): value is FactEvidenceStatus {
  return typeof value === "string" && (FACT_EVIDENCE_STATUSES as readonly string[]).includes(value);
}

/** Defensive clone with runtime freeze — never shares identity with anything. */
function frozenEvidence(e: FactEvidence): FactEvidence {
  return Object.freeze({
    value: e.value,
    source: e.source,
    status: e.status,
    ...(e.reason !== undefined ? { reason: e.reason } : {}),
    ...(e.at !== undefined ? { at: e.at } : {}),
  });
}

function frozenHistory(entries: readonly FactEvidence[]): readonly FactEvidence[] {
  return Object.freeze(entries.map((e) => frozenEvidence(e)));
}

function frozenState(canonical: FactEvidence | null, history: readonly FactEvidence[]): FactEvidenceState {
  return Object.freeze({ canonical: canonical ? frozenEvidence(canonical) : null, history: frozenHistory(history) });
}

function frozenResult(result: FactEvidenceDecisionResult): FactEvidenceDecisionResult {
  return Object.freeze({
    decision: result.decision,
    state: result.state,
    reason: result.reason,
    ...(result.conflictWith ? { conflictWith: frozenEvidence(result.conflictWith) } : {}),
  });
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

/** Canonical is represented in history when an entry shares its value+source. */
function isRepresentedInHistory(canonical: FactEvidence, history: readonly FactEvidence[]): boolean {
  return history.some((e) => e.value === canonical.value && e.source === canonical.source);
}

type ValidatedState =
  | { ok: true; canonical: FactEvidence | null; history: readonly FactEvidence[] }
  | { ok: false; reason: string; history: readonly FactEvidence[] };

/**
 * Validate a prior state WITHOUT silent repair: any malformed canonical,
 * malformed history entry, invalid source/status combination (including a
 * non-trusted independently-verified record) or canonical/history mismatch
 * fails closed. Every individually valid evidence entry is preserved in the
 * returned history regardless of position.
 */
function validateState(raw: FactEvidenceState | null): ValidatedState {
  if (raw === null) return { ok: true, canonical: null, history: [] };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "prior state is not an object", history: [] };
  }
  if (!Array.isArray(raw.history)) {
    return { ok: false, reason: "prior history is not an array", history: [] };
  }
  const validHistory: FactEvidence[] = [];
  let historyFailure: string | null = null;
  for (const entry of raw.history) {
    if (!isValidEvidenceShape(entry)) {
      if (!historyFailure) {
        historyFailure = `malformed history entry: ${JSON.stringify(entry)}`;
      }
      continue;
    }
    validHistory.push(entry);
  }
  if (historyFailure) {
    return { ok: false, reason: historyFailure, history: validHistory };
  }
  if (raw.canonical !== null && raw.canonical !== undefined) {
    if (!isValidEvidenceShape(raw.canonical)) {
      return {
        ok: false,
        reason: `malformed canonical record: ${JSON.stringify(raw.canonical)}`,
        history: validHistory,
      };
    }
    if (!isRepresentedInHistory(raw.canonical as FactEvidence, validHistory)) {
      return {
        ok: false,
        reason: "canonical record is not represented in cumulative history",
        history: validHistory,
      };
    }
  }
  return {
    ok: true,
    canonical: raw.canonical ? (raw.canonical as FactEvidence) : null,
    history: validHistory,
  };
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
  return frozenResult({
    decision,
    state: frozenState(canonical, history),
    reason,
    ...(conflictWith ? { conflictWith: frozenEvidence(conflictWith) } : {}),
  });
}

/**
 * Pure decision function over an immutable cumulative state.
 *
 * `state` (or null) is the previous evidence state; `incoming` is the new
 * evidence; options carry the only legitimate transition signals. Returns a
 * NEW frozen state whose history is the previous history plus the incoming
 * evidence. Never mutates any input; never touches the clock unless `nowMs`
 * is supplied; never knows a category or a field; performs NO authentication.
 */
export function evaluateFactEvidence(
  state: FactEvidenceState | null,
  incoming: unknown,
  options: EvaluateFactEvidenceOptions = {}
): FactEvidenceDecisionResult {
  const validatedState = validateState(state);
  if (!validatedState.ok) {
    // Fail closed WITHOUT accepting the incoming evidence: the caller must
    // recover/reconstruct the state explicitly. Valid evidence found so far
    // is preserved in the returned history.
    return buildResult("INVALID_STATE", null, validatedState.history, validatedState.reason);
  }
  const priorHistory = validatedState.history;
  const current = validatedState.canonical;

  const validated = validateIncoming(incoming, options);
  if (validated.invalidReason) {
    // Fail closed: rejected evidence cannot become canonical and is not
    // recorded as considered evidence.
    return buildResult(
      "REJECT_UNSUPPORTED_INFERENCE",
      current,
      priorHistory,
      validated.invalidReason
    );
  }
  const inc = validated.evidence;
  const historyWithIncoming: readonly FactEvidence[] = [...priorHistory, inc];

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
    // First credible evidence establishes the canonical value. SAME_VALUE is
    // reserved for comparisons of two equal values, so this is ACCEPT_EVIDENCE.
    return buildResult("ACCEPT_EVIDENCE", inc, historyWithIncoming, "first evidence for this field");
  }

  // Rule 4: an authenticated trusted verification always supersedes, and is
  // the only path to INDEPENDENTLY_VERIFIED. The resulting canonical record is
  // a VALID TRUSTED_VERIFICATION + INDEPENDENTLY_VERIFIED combination (the
  // verification record itself), so the returned state re-validates on the
  // next evaluation; the prior claim/observation stays separately in history.
  if (inc.source === "TRUSTED_VERIFICATION") {
    if (sameValue(current, inc)) {
      return buildResult("SAME_VALUE", inc, historyWithIncoming,
        "trusted verification upgrades the same normalized value — prior evidence retained in history");
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
