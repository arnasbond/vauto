/**
 * Deduplicate republished / duplicate listings by dedupeKey (keep newest).
 */

import type { MarketObservation } from "./types.js";

export type DedupeResult = {
  unique: MarketObservation[];
  removedCount: number;
};

export function deduplicateObservations(obs: MarketObservation[]): DedupeResult {
  const byKey = new Map<string, MarketObservation>();
  let removed = 0;

  const sorted = [...obs].sort(
    (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()
  );

  for (const o of sorted) {
    const key = o.dedupeKey ?? o.id;
    if (byKey.has(key)) {
      removed += 1;
      continue;
    }
    byKey.set(key, o);
  }

  return { unique: [...byKey.values()], removedCount: removed };
}
