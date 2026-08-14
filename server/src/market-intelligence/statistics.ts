/**
 * Weighted statistics with exponential time decay.
 * No false precision — round range endpoints to orientation buckets.
 */

import { medianOf, quantile } from "./outlier-control.js";

export type WeightedPrice = { price: number; weight: number; observedAt: string };

/** Half-life in days — after this age, weight ≈ 0.5. */
export const TIME_DECAY_HALF_LIFE_DAYS = 45;

export function timeDecayWeight(
  observedAt: string,
  now = new Date(),
  halfLifeDays = TIME_DECAY_HALF_LIFE_DAYS
): number {
  const t = new Date(observedAt).getTime();
  if (!Number.isFinite(t)) return 0.25;
  const ageDays = Math.max(0, (now.getTime() - t) / (86400 * 1000));
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function attachTimeWeights(
  items: { price: number; observedAt: string }[],
  now = new Date()
): WeightedPrice[] {
  return items.map((i) => ({
    price: i.price,
    observedAt: i.observedAt,
    weight: timeDecayWeight(i.observedAt, now),
  }));
}

/** Weighted median via cumulative weight. */
export function weightedMedian(items: WeightedPrice[]): number {
  if (items.length === 0) return 0;
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return medianOf(sorted.map((i) => i.price));
  let acc = 0;
  const half = total / 2;
  for (const it of sorted) {
    acc += it.weight;
    if (acc >= half) return it.price;
  }
  return sorted[sorted.length - 1].price;
}

export function weightedPercentile(items: WeightedPrice[], p: number): number {
  if (items.length === 0) return 0;
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return quantile(
    sorted.map((i) => i.price),
    p
  );
  let acc = 0;
  const target = total * p;
  for (const it of sorted) {
    acc += it.weight;
    if (acc >= target) return it.price;
  }
  return sorted[sorted.length - 1].price;
}

/**
 * Orientation rounding — avoid false precision like €18,437.
 * Buckets: <1k → 50; <5k → 100; <20k → 100; <100k → 100; else 500.
 */
export function roundOrientation(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  let step = 50;
  if (n >= 100_000) step = 500;
  else if (n >= 20_000) step = 100;
  else if (n >= 5_000) step = 100;
  else if (n >= 1_000) step = 50;
  else step = 10;
  return Math.round(n / step) * step;
}

export type RangeStats = {
  low: number;
  median: number;
  high: number;
  rawLow: number;
  rawMedian: number;
  rawHigh: number;
};

export function computeValuationRange(items: WeightedPrice[]): RangeStats {
  const rawMedian = weightedMedian(items);
  const rawLow = weightedPercentile(items, 0.25);
  const rawHigh = weightedPercentile(items, 0.75);
  let low = roundOrientation(rawLow);
  let median = roundOrientation(rawMedian);
  let high = roundOrientation(rawHigh);
  if (low > median) low = median;
  if (high < median) high = median;
  // Ensure non-degenerate band when all equal
  if (low === high && items.length > 0) {
    const pad = roundOrientation(Math.max(median * 0.03, 50));
    low = Math.max(0, median - pad);
    high = median + pad;
  }
  return { low, median, high, rawLow, rawMedian, rawHigh };
}

export function freshnessBounds(
  items: { observedAt: string }[]
): { newestAt: string | null; oldestAt: string | null } {
  if (items.length === 0) return { newestAt: null, oldestAt: null };
  const times = items
    .map((i) => i.observedAt)
    .filter((t) => Number.isFinite(new Date(t).getTime()))
    .sort();
  return {
    oldestAt: times[0] ?? null,
    newestAt: times[times.length - 1] ?? null,
  };
}
