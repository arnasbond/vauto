import type { UserCoords } from "@/lib/geolocation";
import {
  portalRankedListings,
  portalThemeForQuery,
} from "@/lib/portal-listing-filter";
import {
  applyMarketplaceFilters,
  applyMarketplaceSort,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
} from "@/lib/marketplace-view";
import {
  rankListings,
  resolveSortMode,
} from "@/lib/scoring";
import type { DynamicFilter, Listing, ScoredListing } from "@/lib/types";
import type { VisualSearchProfile } from "@/lib/visual-search";

const SORT_ONLY_BUBBLE_IDS = new Set([
  "newest",
  "cheapest",
  "closest",
  "budget",
  "cheap-service",
]);

export interface DisplayListingsInput {
  visibleListings: Listing[];
  searchQuery: string;
  agentPinnedListingIds: string[] | null;
  marketplaceFilters: MarketplaceFilterState;
  activeFilterIds: Set<string>;
  dynamicFilters: DynamicFilter[];
  visualSearchProfile: VisualSearchProfile | null;
  visualRankScores: Record<string, number>;
  buyerCoords: UserCoords | null;
}

/**
 * Single marketplace results pipeline — pins, bubbles, and FilterBar filters
 * are combined with AND logic (never overwrite each other).
 */
export function buildDisplayListings(input: DisplayListingsInput): ScoredListing[] {
  const filters = normalizeMarketplaceFilters(input.marketplaceFilters);
  const sortMode = resolveSortMode(input.activeFilterIds);
  const rankOpts = {
    visualProfile: input.visualSearchProfile,
    visualRankScores: input.visualRankScores,
  };

  let pool: Listing[] = input.visibleListings;

  if (input.agentPinnedListingIds !== null) {
    if (input.agentPinnedListingIds.length === 0) return [];
    const pinned = new Set(input.agentPinnedListingIds);
    pool = pool.filter((l) => pinned.has(l.id));
  }

  let results = rankListings(
    pool,
    input.searchQuery,
    sortMode,
    rankOpts
  );

  if (input.agentPinnedListingIds !== null && filters.sort === "relevance") {
    const order = new Map(
      input.agentPinnedListingIds.map((id, index) => [id, index])
    );
    results = [...results].sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    );
  }

  if (input.activeFilterIds.size > 0) {
    const bubblePredicates = input.dynamicFilters.filter(
      (f) =>
        input.activeFilterIds.has(f.id) && !SORT_ONLY_BUBBLE_IDS.has(f.id)
    );
    if (bubblePredicates.length > 0) {
      results = results.filter((l) =>
        bubblePredicates.every((f) => f.apply(l))
      );
    }
  }

  const q = input.searchQuery.trim();
  if (q && portalThemeForQuery(q) !== "flux") {
    results = portalRankedListings(q, results);
  }

  results = applyMarketplaceFilters(results, filters, input.buyerCoords);

  const effectiveSort =
    filters.sort !== "relevance" ? filters.sort : sortMode === "default" ? "relevance" : sortMode;

  return applyMarketplaceSort(results, effectiveSort);
}
