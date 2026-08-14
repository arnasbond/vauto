/**
 * Comparable Expansion Ladder — widening the set MUST reduce confidence factor.
 * External comps only when externalApproved === true (licensed).
 */

import {
  COMPARABLE_EXPANSION_LADDER,
  type ComparableLevel as FoundationLevel,
} from "../ai/foundation/comparable-policy.js";
import { minSamplesForLevel } from "./comparable-policy.js";
import { sameBrandModel } from "./normalizer.js";
import type { ComparableLevel, MarketObservation, MarketSubject } from "./types.js";

export { COMPARABLE_EXPANSION_LADDER };

function norm(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().normalize("NFC").trim();
}

function yearClose(a?: number | null, b?: number | null, tol = 2): boolean {
  if (a == null || b == null) return true;
  return Math.abs(a - b) <= tol;
}

export function selectAtLevel(
  subject: MarketSubject,
  pool: MarketObservation[],
  level: Exclude<ComparableLevel, "INSUFFICIENT_DATA">
): MarketObservation[] {
  return pool.filter((o) => {
    if (o.category !== subject.category && level !== "APPROVED_EXTERNAL") {
      // CATEGORY_RELAXED still same category; external may be same category only too
      if (level === "CATEGORY_RELAXED") return o.category === subject.category;
    }
    if (o.category !== subject.category) return false;

    if (level === "LOCAL_STRICT") {
      return (
        sameBrandModel(subject, o) &&
        norm(subject.location) !== "" &&
        norm(o.location) === norm(subject.location) &&
        yearClose(subject.year, o.year, 1)
      );
    }
    if (level === "LOCAL_RELAXED") {
      return (
        sameBrandModel(subject, o) &&
        (norm(subject.location) === "" ||
          norm(o.location) === norm(subject.location) ||
          norm(o.location).includes(norm(subject.location))) &&
        yearClose(subject.year, o.year, 3)
      );
    }
    if (level === "CATEGORY_RELAXED") {
      // Same brand preferred; allow model miss if brand matches
      if (norm(subject.brand) && norm(o.brand) !== norm(subject.brand)) return false;
      return yearClose(subject.year, o.year, 5);
    }
    // APPROVED_EXTERNAL
    if (!o.externalApproved || o.priceSource !== "VERIFIED_EXTERNAL") return false;
    return sameBrandModel(subject, o) || norm(o.brand) === norm(subject.brand);
  });
}

export type LadderPick = {
  level: ComparableLevel;
  comps: MarketObservation[];
  confidenceFactor: number;
};

/**
 * Walk ladder; pick tightest level meeting min sample policy.
 * If none → INSUFFICIENT_DATA.
 */
export function pickComparableLevel(
  subject: MarketSubject,
  pool: MarketObservation[]
): LadderPick {
  for (const step of COMPARABLE_EXPANSION_LADDER) {
    const level = step.level as Exclude<FoundationLevel, "INSUFFICIENT_DATA">;
    const comps = selectAtLevel(subject, pool, level);
    if (comps.length >= minSamplesForLevel(level)) {
      return {
        level,
        comps,
        confidenceFactor: step.confidenceFactor,
      };
    }
  }
  return {
    level: "INSUFFICIENT_DATA",
    comps: [],
    confidenceFactor: 0,
  };
}
