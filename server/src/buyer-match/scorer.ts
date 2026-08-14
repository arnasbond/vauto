/**
 * Deterministic match score 0–100 from feature vector + MATCH_WEIGHTS.
 * Sponsored/promoted flags are IGNORED (organic score only).
 */

import type { MatchFeatureVector, MatchComponentKey } from "./types.js";
import { MATCH_WEIGHTS } from "./types.js";

export type ScoreOutput = {
  matchScore: number;
  confidence: number;
};

export function scoreMatchFeatures(features: MatchFeatureVector): ScoreOutput {
  let wSum = 0;
  let weighted = 0;

  for (const key of Object.keys(MATCH_WEIGHTS) as MatchComponentKey[]) {
    const value = features[key];
    if (value == null) continue; // UNKNOWN — skip, do not treat as 0 penalty by default
    const w = MATCH_WEIGHTS[key];
    wSum += w;
    weighted += value * w;
  }

  if (wSum <= 0) {
    return { matchScore: 0, confidence: 0 };
  }

  const matchScore = Math.min(100, Math.max(0, Math.round((weighted / wSum) * 10) / 10));
  const confidence = Math.min(
    1,
    Math.max(0, Math.round(features.dataCoverage * (wSum / 1) * 1000) / 1000)
  );

  return { matchScore, confidence };
}

/**
 * Compare two eligible scores for ranking: higher score first, then confidence, then id.
 */
export function compareMatchScores(
  a: { matchScore: number; confidence: number; listingId: string },
  b: { matchScore: number; confidence: number; listingId: string }
): number {
  if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return a.listingId.localeCompare(b.listingId);
}
