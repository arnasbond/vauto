/**
 * Buyer Match Engine 1.0 — orchestration.
 * HARD FILTERS from 10B → score only eligible → primary ranking never includes ineligible.
 */

import { extractMatchFeatures } from "./feature-extractor.js";
import { buildMatchSummary } from "./explanation.js";
import {
  filterHardEligible,
  revalidateListing,
} from "./hard-constraint-filter.js";
import { normalizePreferences } from "./preference-normalizer.js";
import { rankEligibleMatches, toIneligibleResult } from "./ranking.js";
import {
  parseBuyerMatchRequest,
  parseBuyerMatchResponse,
  type BuyerMatchRequest,
  type BuyerMatchResponse,
  type BuyerMatchResult,
} from "./schema.js";
import { scoreMatchFeatures } from "./scorer.js";
import type { MatchListingRecord } from "./types.js";
import { BUYER_MATCH_VERSION } from "./version.js";

export type RunBuyerMatchInput = {
  request: BuyerMatchRequest;
  /** Real DB / catalog rows for the candidate ids (never LLM-fabricated). */
  listings: MatchListingRecord[];
  calculatedAt?: string;
};

/**
 * Main entry: evaluate candidates from 10B set only.
 */
export function runBuyerMatch(input: RunBuyerMatchInput): BuyerMatchResponse {
  const request = parseBuyerMatchRequest(input.request);
  const { hard, soft } = normalizePreferences(
    request.searchQuery,
    request.preferences
  );

  const { eligible, ineligible, unknownIds } = filterHardEligible(
    input.listings,
    request.candidateListingIds,
    hard
  );

  const ineligibleResults: BuyerMatchResult[] = [
    ...ineligible.map((x) => toIneligibleResult(x.listing.id)),
    ...unknownIds.map((id) => toIneligibleResult(id)),
  ];

  // Revalidation gate before scoring
  const stillEligible: MatchListingRecord[] = [];
  for (const l of eligible) {
    const rev = revalidateListing(l);
    if (!rev.ok) {
      ineligibleResults.push(toIneligibleResult(l.id));
    } else {
      stillEligible.push(l);
    }
  }

  const rankables = stillEligible.map((listing) => {
    // Sponsored/promoted MUST NOT affect organic score — never read those flags in scorer path
    const features = extractMatchFeatures(listing, hard, soft);
    const scored = scoreMatchFeatures(features);
    return {
      listingId: listing.id,
      matchScore: scored.matchScore,
      confidence: scored.confidence,
      reasons: features.reasons,
      tradeoffs: features.tradeoffs,
      mileage: listing.mileage,
      distanceKm: listing.distanceKm,
      vautoScore: listing.vautoScore,
    };
  });

  const rankedListings = rankEligibleMatches(rankables);
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const totalCandidatesEvaluated = request.candidateListingIds.length;
  const eligibleCount = rankedListings.length;

  const summaryExplanation = buildMatchSummary(
    rankedListings,
    eligibleCount,
    totalCandidatesEvaluated
  );

  return parseBuyerMatchResponse({
    totalCandidatesEvaluated,
    eligibleCount,
    rankedListings,
    ineligibleListings: ineligibleResults,
    summaryExplanation,
    calculatedAt,
    version: BUYER_MATCH_VERSION,
  });
}

export { BUYER_MATCH_VERSION };
