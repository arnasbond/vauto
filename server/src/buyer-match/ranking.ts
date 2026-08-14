/**
 * Rank eligible matches; attach relative tradeoffs vs top result.
 * Ineligible listings never enter the primary ranked list.
 */

import type { BuyerMatchResult } from "./schema.js";
import { compareMatchScores } from "./scorer.js";
import type { TradeoffCode } from "./types.js";
import { BUYER_MATCH_VERSION } from "./version.js";

export type Rankable = {
  listingId: string;
  matchScore: number;
  confidence: number;
  reasons: string[];
  tradeoffs: string[];
  mileage?: number | null;
  distanceKm?: number | null;
  vautoScore?: number | null;
};

export function rankEligibleMatches(items: Rankable[]): BuyerMatchResult[] {
  const sorted = [...items].sort(compareMatchScores);
  if (sorted.length === 0) return [];

  const top = sorted[0];
  return sorted.map((row) => {
    const tradeoffs = new Set(row.tradeoffs as TradeoffCode[]);
    if (
      top.listingId !== row.listingId &&
      row.mileage != null &&
      top.mileage != null &&
      row.mileage > top.mileage * 1.15
    ) {
      tradeoffs.add("HIGHER_MILEAGE_THAN_TOP_RESULT");
    }
    if (
      top.listingId !== row.listingId &&
      row.distanceKm != null &&
      top.distanceKm != null &&
      row.distanceKm > top.distanceKm * 1.25
    ) {
      tradeoffs.add("FARTHER_THAN_TOP_RESULT");
    }
    if (
      top.listingId !== row.listingId &&
      row.vautoScore != null &&
      top.vautoScore != null &&
      row.vautoScore + 8 < top.vautoScore
    ) {
      tradeoffs.add("LOWER_VAUTO_SCORE_THAN_TOP");
    }

    return {
      listingId: row.listingId,
      eligible: true as const,
      matchScore: row.matchScore,
      confidence: row.confidence,
      reasons: row.reasons,
      tradeoffs: [...tradeoffs],
      version: BUYER_MATCH_VERSION,
    };
  });
}

export function toIneligibleResult(listingId: string): BuyerMatchResult {
  return {
    listingId,
    eligible: false,
    matchScore: null,
    confidence: 0,
    reasons: [],
    tradeoffs: [],
    version: BUYER_MATCH_VERSION,
  };
}
