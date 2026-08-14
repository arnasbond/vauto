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

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a === b;
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  return a === b;
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
  const conflictWith = usable.find(
    (c) => c !== top && !valuesEqual(c.value, top.value) && SOURCE_RANK[c.source] >= 40
  );

  const policy = applyConfidencePolicy(top.value as T, top.confidence);
  let value = policy.abstained ? null : (policy.value as T | null);
  let confidence = clampConfidence(top.confidence);
  let requiresConfirmation =
    policy.requiresUserConfirmation || opts?.critical === true;

  if (conflictWith) {
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
          ...(conflictWith.evidence ?? []),
          `conflict:${key}`,
        ],
      },
      conflict: true,
      warning: `Konfliktas lauke „${key}”: ${String(top.value)} (${top.source}) vs ${String(conflictWith.value)} (${conflictWith.source}) — patvirtinkite.`,
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
