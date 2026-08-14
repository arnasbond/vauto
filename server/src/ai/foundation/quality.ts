/**
 * VAUTO AI Foundation — quality gateway metrics helpers.
 * AI outputs are recommendations; accuracy vs ground truth comes from product feedback / DB.
 */

export type AiQualitySample = {
  /** Whether the AI suggestion matched accepted/corrected ground truth. */
  accurate: boolean | null;
  latencyMs: number;
  fallbackUsed: boolean;
  abstained: boolean;
  /** User corrected the AI suggestion in HITL flow. */
  userCorrected: boolean;
  estimatedCost: number | null;
};

export type AiQualityMetrics = {
  sampleCount: number;
  accuracy: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  fallbackRate: number | null;
  abstentionRate: number | null;
  userCorrectionRate: number | null;
  estimatedCostTotal: number | null;
  estimatedCostAvg: number | null;
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

function rate(numer: number, denom: number): number | null {
  if (denom <= 0) return null;
  return numer / denom;
}

/** Aggregate quality metrics from samples (offline eval / rolling window). */
export function computeAiQualityMetrics(
  samples: AiQualitySample[]
): AiQualityMetrics {
  const n = samples.length;
  if (n === 0) {
    return {
      sampleCount: 0,
      accuracy: null,
      latencyP50Ms: null,
      latencyP95Ms: null,
      fallbackRate: null,
      abstentionRate: null,
      userCorrectionRate: null,
      estimatedCostTotal: null,
      estimatedCostAvg: null,
    };
  }

  const withAccuracy = samples.filter((s) => s.accurate != null);
  const accurateCount = withAccuracy.filter((s) => s.accurate === true).length;

  const latencies = samples
    .map((s) => s.latencyMs)
    .filter((x) => Number.isFinite(x) && x >= 0)
    .sort((a, b) => a - b);

  const fallbackCount = samples.filter((s) => s.fallbackUsed).length;
  const abstainCount = samples.filter((s) => s.abstained).length;
  const correctedCount = samples.filter((s) => s.userCorrected).length;

  const costs = samples
    .map((s) => s.estimatedCost)
    .filter((c): c is number => c != null && Number.isFinite(c));
  const costTotal = costs.length ? costs.reduce((a, b) => a + b, 0) : null;

  return {
    sampleCount: n,
    accuracy: withAccuracy.length
      ? rate(accurateCount, withAccuracy.length)
      : null,
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    fallbackRate: rate(fallbackCount, n),
    abstentionRate: rate(abstainCount, n),
    userCorrectionRate: rate(correctedCount, n),
    estimatedCostTotal: costTotal,
    estimatedCostAvg:
      costTotal == null || costs.length === 0 ? null : costTotal / costs.length,
  };
}

/** Soft gate: returns true when core SLOs look healthy enough to promote a model. */
export function passesAiQualityGate(
  metrics: AiQualityMetrics,
  thresholds: {
    minSamples: number;
    minAccuracy: number;
    maxLatencyP95Ms: number;
    maxFallbackRate: number;
    maxAbstentionRate: number;
  }
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (metrics.sampleCount < thresholds.minSamples) {
    reasons.push(
      `insufficient_samples:${metrics.sampleCount}<${thresholds.minSamples}`
    );
  }
  if (
    metrics.accuracy != null &&
    metrics.accuracy < thresholds.minAccuracy
  ) {
    reasons.push(
      `accuracy_below:${metrics.accuracy.toFixed(3)}<${thresholds.minAccuracy}`
    );
  }
  if (
    metrics.latencyP95Ms != null &&
    metrics.latencyP95Ms > thresholds.maxLatencyP95Ms
  ) {
    reasons.push(
      `latency_p95_above:${Math.round(metrics.latencyP95Ms)}>${thresholds.maxLatencyP95Ms}`
    );
  }
  if (
    metrics.fallbackRate != null &&
    metrics.fallbackRate > thresholds.maxFallbackRate
  ) {
    reasons.push(
      `fallback_rate_above:${metrics.fallbackRate.toFixed(3)}>${thresholds.maxFallbackRate}`
    );
  }
  if (
    metrics.abstentionRate != null &&
    metrics.abstentionRate > thresholds.maxAbstentionRate
  ) {
    reasons.push(
      `abstention_rate_above:${metrics.abstentionRate.toFixed(3)}>${thresholds.maxAbstentionRate}`
    );
  }
  return { ok: reasons.length === 0, reasons };
}
