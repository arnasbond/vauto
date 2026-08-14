/**
 * Outlier control — median + IQR fences; audit counters.
 */

export type Priced = { id: string; price: number; weight?: number };

export type OutlierControlResult<T extends Priced> = {
  accepted: T[];
  excluded: T[];
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
  originalComparableCount: number;
  acceptedComparableCount: number;
  excludedOutlierCount: number;
};

function sortedPrices(items: Priced[]): number[] {
  return items.map((i) => i.price).sort((a, b) => a - b);
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function medianOf(sorted: number[]): number {
  return quantile(sorted, 0.5);
}

/**
 * Tukey-style fences: [Q1 - k*IQR, Q3 + k*IQR]. Default k=1.5.
 * Extreme €1 or €92k noise relative to cluster is removed.
 */
export function controlOutliers<T extends Priced>(
  items: T[],
  k = 1.5
): OutlierControlResult<T> {
  const originalComparableCount = items.length;
  if (items.length === 0) {
    return {
      accepted: [],
      excluded: [],
      median: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      lowerFence: 0,
      upperFence: 0,
      originalComparableCount: 0,
      acceptedComparableCount: 0,
      excludedOutlierCount: 0,
    };
  }

  const prices = sortedPrices(items);
  const q1 = quantile(prices, 0.25);
  const q3 = quantile(prices, 0.75);
  const median = medianOf(prices);
  const iqr = Math.max(0, q3 - q1);
  // When IQR is tiny (identical prices), use relative band around median
  const band = iqr > 0 ? iqr : Math.max(median * 0.15, 50);
  const lowerFence = q1 - k * band;
  const upperFence = q3 + k * band;

  const accepted: T[] = [];
  const excluded: T[] = [];
  for (const it of items) {
    if (it.price >= lowerFence && it.price <= upperFence) accepted.push(it);
    else excluded.push(it);
  }

  // Safety: never drop below 3 if we started with enough — keep closest to median
  if (accepted.length < 3 && items.length >= 5) {
    const byDist = [...items].sort(
      (a, b) => Math.abs(a.price - median) - Math.abs(b.price - median)
    );
    return {
      accepted: byDist.slice(0, Math.min(items.length, Math.max(3, Math.ceil(items.length * 0.6)))),
      excluded: byDist.slice(Math.min(items.length, Math.max(3, Math.ceil(items.length * 0.6)))),
      median,
      q1,
      q3,
      iqr,
      lowerFence,
      upperFence,
      originalComparableCount,
      acceptedComparableCount: Math.min(
        items.length,
        Math.max(3, Math.ceil(items.length * 0.6))
      ),
      excludedOutlierCount:
        originalComparableCount -
        Math.min(items.length, Math.max(3, Math.ceil(items.length * 0.6))),
    };
  }

  return {
    accepted,
    excluded,
    median,
    q1,
    q3,
    iqr,
    lowerFence,
    upperFence,
    originalComparableCount,
    acceptedComparableCount: accepted.length,
    excludedOutlierCount: excluded.length,
  };
}
