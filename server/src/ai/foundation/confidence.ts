/**
 * VAUTO AI Foundation — centralized confidence & abstention policy.
 * AI never asserts DB/finance facts; low confidence must abstain (HITL).
 */

export type AiConfidenceTier = "HIGH" | "MEDIUM" | "ABSTAIN";

export type AiConfidenceResult<T> = {
  /** Null when abstained — callers must not treat as factual payload. */
  value: T | null;
  confidence: number;
  tier: AiConfidenceTier;
  abstained: boolean;
  /** Requires explicit human confirmation before write/side-effects. */
  requiresUserConfirmation: boolean;
  reason: string;
};

export const AI_CONFIDENCE_HIGH_MIN = 0.9;
export const AI_CONFIDENCE_MEDIUM_MIN = 0.7;

export function clampConfidence(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

export function classifyConfidenceTier(confidence: number): AiConfidenceTier {
  const c = clampConfidence(confidence);
  if (c >= AI_CONFIDENCE_HIGH_MIN) return "HIGH";
  if (c >= AI_CONFIDENCE_MEDIUM_MIN) return "MEDIUM";
  return "ABSTAIN";
}

/**
 * Wrap a candidate value with policy tiers.
 * HIGH → fill/suggest freely (still not authoritative for money/legal).
 * MEDIUM → HITL confirmation required.
 * ABSTAIN → value null, abstained true.
 */
export function applyConfidencePolicy<T>(
  value: T,
  confidence: number,
  options?: { reason?: string }
): AiConfidenceResult<T> {
  const c = clampConfidence(confidence);
  const tier = classifyConfidenceTier(c);

  if (tier === "ABSTAIN") {
    return {
      value: null,
      confidence: c,
      tier,
      abstained: true,
      requiresUserConfirmation: true,
      reason:
        options?.reason ??
        `confidence ${c.toFixed(2)} < ${AI_CONFIDENCE_MEDIUM_MIN} — abstain`,
    };
  }

  if (tier === "MEDIUM") {
    return {
      value,
      confidence: c,
      tier,
      abstained: false,
      requiresUserConfirmation: true,
      reason:
        options?.reason ??
        `confidence ${c.toFixed(2)} in MEDIUM band — user confirmation required`,
    };
  }

  return {
    value,
    confidence: c,
    tier,
    abstained: false,
    requiresUserConfirmation: false,
    reason:
      options?.reason ??
      `confidence ${c.toFixed(2)} >= ${AI_CONFIDENCE_HIGH_MIN} — HIGH`,
  };
}
