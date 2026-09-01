/**
 * Merge extracted fields with source precedence + conflict detection.
 * Precedence: USER_PROVIDED / explicit TEXT|VOICE > trusted evidence > VISION > heuristic.
 * OCR_UNTRUSTED never wins as a fact.
 */

import {
  applyConfidencePolicy,
  clampConfidence,
} from "../foundation/confidence.js";
import type {
  ExtractedField,
  SellFactEvidenceProjection,
} from "./sell-draft-schema.js";
import type { SellFieldSource } from "./sell-types.js";
import {
  evaluateFieldEvidence,
  type FactEvidenceState,
} from "../../shared/fact-evidence-adapter.js";
import type {
  FactDecision,
  FactEvidence,
} from "../../shared/fact-evidence.js";

const SOURCE_RANK: Record<SellFieldSource, number> = {
  USER_PROVIDED: 100,
  TEXT: 80,
  VOICE: 80,
  COMBINED: 70,
  VISION: 40,
  OCR_UNTRUSTED: 10,
};

export type FieldCandidate<T> = {
  value: T | null;
  confidence: number;
  source: SellFieldSource;
  evidence?: string[];
};

/**
 * F2.2 — structured fact-evidence projection of one merged field (alias of the
 * schema-validated SellFactEvidenceProjection). The cumulative F2.1
 * `FactEvidenceState` (canonical + full history), the LAST decision the
 * contract produced, the competing evidence when a CONFLICT was detected, and
 * the derived human-review signal. Category-neutral — no vertical knowledge
 * lives here.
 */
export type MergeFieldEvidenceProjection = SellFactEvidenceProjection;

export type MergeResult<T> = {
  field: ExtractedField<T>;
  conflict: boolean;
  warning?: string;
  factEvidence?: MergeFieldEvidenceProjection;
};

export type MergeFieldCandidatesOptions = {
  critical?: boolean;
  /**
   * F2 closure — prior cumulative evidence state of this field (draft
   * round-trip). The evidence chain continues: history grows, the canonical
   * value is preserved, and a persisted conflict stays active until a real
   * human correction resolves it.
   */
  existingFactEvidence?: MergeFieldEvidenceProjection;
  /** F2 closure — explicit human correction intent (legitimate conflict resolution). */
  isUserCorrection?: boolean;
};

/**
 * Preserve the merge boundary's existing equality semantics while supplying the
 * fact-evidence contract with caller-normalized strings. Strings remain
 * trim/case-insensitive (no type prefix — the projected canonical/competing
 * values stay human-readable); primitives compare by value; object-like values
 * compare by identity, exactly as the previous `valuesEqual` implementation did.
 */
function toMergeFactValue(
  value: unknown,
  referenceTokens: Map<unknown, string>,
  occurrence: number
): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number") {
    if (Number.isNaN(value)) return `number:nan:${occurrence}`;
    return `number:${Object.is(value, -0) ? "0" : String(value)}`;
  }
  if (typeof value === "boolean") return `boolean:${value}`;
  if (typeof value === "bigint") return `bigint:${String(value)}`;
  if (value === null) return "null";

  let token = referenceTokens.get(value);
  if (!token) {
    token = `reference:${referenceTokens.size + 1}`;
    referenceTokens.set(value, token);
  }
  return token;
}

/**
 * F2.2 — the ORIGINAL typed competing value, kept separate from the normalized
 * fact-evidence comparison key. STRICT boundary: bounded string, finite
 * number or boolean only; every other value (objects, arrays, null, NaN,
 * ±Infinity…) yields undefined (fail-closed — the intel layer then forces
 * review without inventing a typed value).
 */
function safeOriginalValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") return value.length <= 500 ? value : undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

export function mergeFieldCandidates<T>(
  key: string,
  candidates: Array<FieldCandidate<T>>,
  opts?: MergeFieldCandidatesOptions
): MergeResult<T> {
  const usable = candidates.filter(
    (c) => c.value != null && c.source !== "OCR_UNTRUSTED"
  );
  if (!usable.length) {
    return {
      field: {
        value: null,
        confidence: 0,
        source: "COMBINED",
        requiresConfirmation: true,
      },
      conflict: false,
    };
  }

  usable.sort(
    (a, b) =>
      SOURCE_RANK[b.source] - SOURCE_RANK[a.source] ||
      b.confidence - a.confidence
  );
  const top = usable[0]!;

  // F2.1 — fact-evidence is the decision authority. Fold the already-normalized
  // candidates through evaluateFieldEvidence in the SAME precedence order,
  // threading the cumulative state so CONFLICT / unsupported evidence can
  // actually arise at this seam. The sorted `top` candidate remains the value
  // authority (existing precedence); the decision only governs confirmation.
  // F2 closure — the chain starts from the PRIOR state (round-trip continuity).
  let state: FactEvidenceState | null = opts?.existingFactEvidence?.state ?? null;
  let conflictCandidate: FieldCandidate<T> | null = null;
  let conflictWith: FactEvidence | undefined;
  let lastDecision: FactDecision = "INSUFFICIENT_EVIDENCE";
  let forcesConfirmation = false;
  const referenceTokens = new Map<unknown, string>();
  for (const [index, candidate] of usable.entries()) {
    const decision = evaluateFieldEvidence(state, {
      value: toMergeFactValue(candidate.value, referenceTokens, index),
      source: candidate.source,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
    }, {
      isExplicitCorrection: opts?.isUserCorrection,
    });
    if (!decision) continue;
    state = decision.state;
    lastDecision = decision.decision;
    if (decision.decision === "CONFLICT" && !conflictCandidate) {
      conflictCandidate = candidate;
      conflictWith = decision.conflictWith;
    }
    if (
      decision.decision === "REJECT_UNSUPPORTED_INFERENCE" ||
      decision.decision === "INSUFFICIENT_EVIDENCE" ||
      decision.decision === "REQUIRES_REVERIFICATION" ||
      decision.decision === "INVALID_STATE"
    ) {
      forcesConfirmation = true;
    }
  }

  // F2 closure — persisted conflicts stay active across round-trips until a
  // real human correction resolves them. The competing evidence travels WITH
  // the projection (same snapshot as the state), so carrying it forward is
  // consistent; ACCEPT_CORRECTION is the one legitimate resolution.
  const resolvedByCorrection = lastDecision === "ACCEPT_CORRECTION";
  const persistedConflict = resolvedByCorrection
    ? undefined
    : opts?.existingFactEvidence?.conflictWith;
  const effectiveConflictWith = conflictWith ?? persistedConflict;
  const conflictPersists = Boolean(conflictCandidate || persistedConflict);

  const policy = applyConfidencePolicy(top.value as T, top.confidence);
  const value = policy.abstained ? null : (policy.value as T | null);
  const confidence = clampConfidence(top.confidence);
  let requiresConfirmation =
    policy.requiresUserConfirmation ||
    opts?.critical === true ||
    forcesConfirmation;

  if (conflictCandidate) {
    requiresConfirmation = true;
    // F2.2 — the structured state survives the merge boundary: canonical value,
    // cumulative history, the CONFLICT decision and the competing evidence are
    // all carried forward for schema validation and the intel projection.
    const conflictOriginal = conflictCandidate
      ? safeOriginalValue(conflictCandidate.value)
      : undefined;
    const factEvidence: MergeFieldEvidenceProjection = {
      state: state!,
      lastDecision,
      ...(effectiveConflictWith ? { conflictWith: effectiveConflictWith } : {}),
      ...(conflictOriginal !== undefined
        ? { conflictOriginalValue: conflictOriginal }
        : {}),
      reviewRequired: true,
    };
    // Keep higher-precedence value but force confirm
    return {
      field: {
        value,
        confidence: Math.min(confidence, 0.85),
        source: "COMBINED",
        requiresConfirmation: true,
        evidence: [
          ...(top.evidence ?? []),
          ...(conflictCandidate.evidence ?? []),
          `conflict:${key}`,
        ],
      },
      conflict: true,
      warning: `Konfliktas lauke „${key}”: ${String(top.value)} (${top.source}) vs ${String(conflictCandidate.value)} (${conflictCandidate.source}) — patvirtinkite.`,
      factEvidence,
    };
  }

  if (opts?.critical && value != null) {
    const hasEvidence = (top.evidence?.length ?? 0) > 0;
    if (!hasEvidence) {
      return {
        field: {
          value: null,
          confidence,
          source: top.source,
          requiresConfirmation: true,
          evidence: top.evidence,
        },
        conflict: false,
        warning: `Kritinis laukas „${key}” be pakankamų įrodymų — nepaliekame kaip fakto.`,
        ...(state
          ? {
              factEvidence: {
                state,
                lastDecision,
                ...(effectiveConflictWith ? { conflictWith: effectiveConflictWith } : {}),
                reviewRequired: true,
              },
            }
          : {}),
      };
    }
    // Evidence present but not HIGH → keep as prefill + forced confirmation
    if (confidence < 0.9) {
      requiresConfirmation = true;
    }
  }

  // F2 closure — a persisted conflict keeps confirmation and review active
  // across round-trips; the competing evidence stays attached.
  const finalRequiresConfirmation =
    requiresConfirmation || value == null || conflictPersists;
  return {
    field: {
      value,
      confidence,
      source: top.source,
      requiresConfirmation: finalRequiresConfirmation,
      evidence: top.evidence,
    },
    conflict: conflictPersists,
    ...(state
      ? {
          factEvidence: {
            state,
            lastDecision,
            ...(effectiveConflictWith ? { conflictWith: effectiveConflictWith } : {}),
            reviewRequired: finalRequiresConfirmation,
          },
        }
      : {}),
  };
}

/** Price may only come from explicit user text/voice — never vision pseudo-valuation. */
export function mergePriceField(
  candidates: Array<FieldCandidate<number>>
): MergeResult<number> {
  const allowed = candidates.filter(
    (c) =>
      c.value != null &&
      (c.source === "USER_PROVIDED" ||
        c.source === "TEXT" ||
        c.source === "VOICE")
  );
  if (!allowed.length) {
    return {
      field: {
        value: null,
        confidence: 0,
        source: "USER_PROVIDED",
        requiresConfirmation: true,
      },
      conflict: false,
    };
  }
  return mergeFieldCandidates("price", allowed.map((c) => ({
    ...c,
    source: "USER_PROVIDED" as const,
  })));
}
