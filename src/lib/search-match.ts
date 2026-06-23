import type { ScoredListing } from "@/lib/types";

export const STRONG_MATCH_THRESHOLD = 0.28;

export type SearchMatchStatus = "none" | "weak" | "strong";

export function getSearchMatchStatus(
  listings: ScoredListing[]
): SearchMatchStatus {
  if (!listings.length) return "none";
  const top = listings[0];
  if (top && top.semanticRelevance >= STRONG_MATCH_THRESHOLD) return "strong";
  return "weak";
}

export function hasStrongSearchMatch(listings: ScoredListing[]): boolean {
  return getSearchMatchStatus(listings) === "strong";
}
