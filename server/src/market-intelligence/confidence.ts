/**
 * Multi-criteria confidence for Market Intelligence (distinct from foundation AI confidence).
 */

import type { ComparableLevel, PriceSource } from "./types.js";

export type ConfidenceInput = {
  acceptedCount: number;
  originalCount: number;
  level: ComparableLevel;
  levelFactor: number;
  priceSources: PriceSource[];
  /** Average time-decay weight of accepted comps. */
  avgFreshnessWeight: number;
  /** Coefficient of variation of prices (std/mean), lower is better. */
  priceDispersion: number;
};

export function confidenceBand(c: number): "HIGH" | "MEDIUM" | "LOW" {
  if (c >= 0.75) return "HIGH";
  if (c >= 0.5) return "MEDIUM";
  return "LOW";
}

export function computeConfidence(input: ConfidenceInput): number {
  if (input.level === "INSUFFICIENT_DATA" || input.acceptedCount === 0) return 0;

  const sampleScore = Math.min(1, input.acceptedCount / 12);
  const retention =
    input.originalCount > 0 ? input.acceptedCount / input.originalCount : 0;
  const freshness = Math.min(1, Math.max(0, input.avgFreshnessWeight));
  const dispersionPenalty = Math.min(1, Math.max(0, input.priceDispersion));
  const cohesion = Math.max(0, 1 - dispersionPenalty);

  const sources = new Set(input.priceSources);
  let basisScore = 0.7;
  if (sources.size === 1 && sources.has("TRANSACTION_PRICE")) basisScore = 1;
  else if (sources.size === 1 && sources.has("ASKING_PRICE")) basisScore = 0.75;
  else if (sources.has("VERIFIED_EXTERNAL") && sources.size === 1) basisScore = 0.65;
  else basisScore = 0.55; // MIXED

  const raw =
    0.28 * sampleScore +
    0.18 * retention +
    0.22 * freshness +
    0.17 * cohesion +
    0.15 * basisScore;

  return Math.min(1, Math.max(0, Math.round(raw * input.levelFactor * 1000) / 1000));
}

export function priceBasisOf(
  sources: PriceSource[]
): "ASKING_PRICE" | "TRANSACTION_PRICE" | "MIXED" {
  const u = new Set(sources);
  if (u.size === 1 && u.has("ASKING_PRICE")) return "ASKING_PRICE";
  if (u.size === 1 && u.has("TRANSACTION_PRICE")) return "TRANSACTION_PRICE";
  if (u.size === 1 && u.has("VERIFIED_EXTERNAL")) return "ASKING_PRICE"; // treat as ask-like
  return "MIXED";
}

export function coefficientOfVariation(prices: number[]): number {
  if (prices.length < 2) return 0;
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (mean <= 0) return 1;
  const varSum =
    prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  return Math.sqrt(varSum) / mean;
}
