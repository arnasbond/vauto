/**
 * Minimum sample policy per comparable level.
 */

import type { ComparableLevel } from "./types.js";

/** Minimum accepted comps required to publish a range at each level. */
export const MIN_SAMPLES_BY_LEVEL: Record<
  Exclude<ComparableLevel, "INSUFFICIENT_DATA">,
  number
> = {
  LOCAL_STRICT: 5,
  LOCAL_RELAXED: 5,
  CATEGORY_RELAXED: 8,
  APPROVED_EXTERNAL: 10,
};

export function minSamplesForLevel(level: ComparableLevel): number {
  if (level === "INSUFFICIENT_DATA") return Number.POSITIVE_INFINITY;
  return MIN_SAMPLES_BY_LEVEL[level];
}
