/**
 * Merge extracted fields with source precedence + conflict detection.
 * Precedence: USER_PROVIDED / explicit TEXT|VOICE > trusted evidence > VISION > heuristic.
 * OCR_UNTRUSTED never wins as a fact.
 */

import {
  applyConfidencePolicy,
  clampConfidence,
} from "../foundation/confidence.js";
import type { ExtractedField } from "./sell-draft-schema.js";
import type { SellFieldSource } from "./sell-types.js";
import {
  evaluateFieldEvidence,
  type FactEvidenceState,
} from "../../shared/fact-evidence-adapter.js";

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

export type MergeResult<T> = {
  field: ExtractedField<T>;
  conflict: boolean;
  warning?: string;
};

/**
 * Preserve the merge boundary's existing equality semantics while supplying the
 * fact-evidence contract with caller-normalized strings. Strings remain
 * trim/case-insensitive; primitives compare by value; object-like values compare
 * by identity, exactly as the previous `valuesEqual` implementation did.
 */
function toMergeFactValue(
  value: unknown,
  referenceTokens: Map<unknown, string>,
  occurrence: number
): string {
  if (typeof value === "string") return `string:${value.trim().toLowerCase()}`;
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

export function mergeFieldCandidates<T>(
  key: string,
  candidates: Array<FieldCandidate<T>>,
  opts?: { critical?: boolean }
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
  let state: FactEvidenceState | null = null;
  let conflictCandidate: FieldCandidate<T> | null = null;
  let forcesConfirmation = false;
  const referenceTokens = new Map<unknown, string>();
  for (const [index, candidate] of usable.entries()) {
    const decision = evaluateFieldEvidence(state, {
      value: toMergeFactValue(candidate.value, referenceTokens, index),
      source: candidate.source,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
    });
    if (!decision) continue;
    state = decision.state;
    if (decision.decision === "CONFLICT" && !conflictCandidate) {
      conflictCandidate = candidate;
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

  const policy = applyConfidencePolicy(top.value as T, top.confidence);
  let value = policy.abstained ? null : (policy.value as T | null);
  let confidence = clampConfidence(top.confidence);
  let requiresConfirmation =
    policy.requiresUserConfirmation ||
    opts?.critical === true ||
    forcesConfirmation;

  if (conflictCandidate) {
    requiresConfirmation = true;
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
      };
    }
    // Evidence present but not HIGH → keep as prefill + forced confirmation
    if (confidence < 0.9) {
      requiresConfirmation = true;
    }
  }

  return {
    field: {
      value,
      confidence,
      source: top.source,
      requiresConfirmation: requiresConfirmation || value == null,
      evidence: top.evidence,
    },
    conflict: false,
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
