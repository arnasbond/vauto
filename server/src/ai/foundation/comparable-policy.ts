/**
 * Comparable expansion policy foundation.
 * Expanding the comparable set MUST reduce confidence; never invent prices when data is insufficient.
 */

export type ComparableLevel =
  | "LOCAL_STRICT"
  | "LOCAL_RELAXED"
  | "CATEGORY_RELAXED"
  | "APPROVED_EXTERNAL"
  | "INSUFFICIENT_DATA";

export type ComparableExpansionStep = {
  level: ComparableLevel;
  /** Multiplier applied to prior confidence (0–1). */
  confidenceFactor: number;
  description: string;
};

/** Ordered expansion ladder — each step widens the set and lowers confidence. */
export const COMPARABLE_EXPANSION_LADDER: ComparableExpansionStep[] = [
  {
    level: "LOCAL_STRICT",
    confidenceFactor: 1,
    description: "Same locality + tight attribute match",
  },
  {
    level: "LOCAL_RELAXED",
    confidenceFactor: 0.85,
    description: "Same locality with relaxed attributes",
  },
  {
    level: "CATEGORY_RELAXED",
    confidenceFactor: 0.7,
    description: "Broader category / region match",
  },
  {
    level: "APPROVED_EXTERNAL",
    confidenceFactor: 0.55,
    description: "Approved external comps only (HITL for money claims)",
  },
];

export type ComparableExpansionResult = {
  level: ComparableLevel;
  /** Adjusted confidence after expansion; null when insufficient. */
  confidence: number | null;
  sampleSize: number;
  /** When true, callers must show N/A — do not invent a number. */
  insufficientData: boolean;
  message: string;
};

export type ExpandComparablesInput = {
  /** Starting confidence before expansion (0–1). */
  baseConfidence: number;
  /** Observed comparable sample counts per level (available data). */
  samplesByLevel: Partial<Record<ComparableLevel, number>>;
  /** Minimum samples required at a level to accept it. */
  minSamples?: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Walk the expansion ladder and pick the tightest level with enough samples.
 * If none qualify → INSUFFICIENT_DATA (N/A), never a guessed price.
 */
export function resolveComparableExpansion(
  input: ExpandComparablesInput
): ComparableExpansionResult {
  const minSamples = input.minSamples ?? 3;
  const base = clamp01(input.baseConfidence);

  for (const step of COMPARABLE_EXPANSION_LADDER) {
    const n = input.samplesByLevel[step.level] ?? 0;
    if (n >= minSamples) {
      return {
        level: step.level,
        confidence: clamp01(base * step.confidenceFactor),
        sampleSize: n,
        insufficientData: false,
        message: `${step.level}: n=${n}, confidenceFactor=${step.confidenceFactor}`,
      };
    }
  }

  return {
    level: "INSUFFICIENT_DATA",
    confidence: null,
    sampleSize: 0,
    insufficientData: true,
    message:
      "INSUFFICIENT_DATA — return N/A; do not invent comparable price figures",
  };
}

/** Apply an additional explicit expansion (e.g. user approved wider set). */
export function applyExpansionConfidencePenalty(
  confidence: number,
  toLevel: Exclude<ComparableLevel, "INSUFFICIENT_DATA">
): number {
  const step = COMPARABLE_EXPANSION_LADDER.find((s) => s.level === toLevel);
  const factor = step?.confidenceFactor ?? 0.5;
  return clamp01(confidence * factor);
}
