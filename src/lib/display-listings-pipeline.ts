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
  applyFacetFilters,
  parseFacetSearchParams,
  sortFacetListings,
} from "@vauto/shared/marketplace-domain";

import {

  rankListings,

  resolveSortMode,

} from "@/lib/scoring";

import type { DynamicFilter, Listing, ScoredListing } from "@/lib/types";

import type { B2bTrustSeller } from "@/lib/b2b-trust";

import { prioritizeFeedTiers } from "@/lib/feed-tier";

import type { VisualSearchProfile } from "@/lib/visual-search";
import { resolveBrowseAllIntent, effectiveMarketplaceSearchQuery } from "@/lib/browse-all-intent";



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

  sellerRatings?: Record<string, { avg: number; count: number }>;

  sellerProfiles?: Record<string, B2bTrustSeller>;

}



export interface DisplayListingsResult {

  listings: ScoredListing[];

  /** Nationwide matches when local geo filter returns 0 (Marktplaats smart fallback) */

  fallbackListings: ScoredListing[];

}



function hasGeoFilter(filters: MarketplaceFilterState): boolean {

  return Boolean(filters.location.trim()) || filters.radiusKm != null;

}



function hasProductSearchIntent(input: DisplayListingsInput): boolean {

  if (input.searchQuery.trim().length >= 2) return true;

  if (input.visualSearchProfile) return true;

  if (

    input.agentPinnedListingIds !== null &&

    input.agentPinnedListingIds.length > 0

  ) {

    return true;

  }

  const f = normalizeMarketplaceFilters(input.marketplaceFilters);

  return f.category !== "all";

}



function runDisplayPipeline(input: DisplayListingsInput): ScoredListing[] {

  const filters = normalizeMarketplaceFilters(input.marketplaceFilters);

  const sortMode = resolveSortMode(input.activeFilterIds);

  const rankOpts = {

    visualProfile: input.visualSearchProfile,

    visualRankScores: input.visualRankScores,

    sellerRatings: input.sellerRatings,

    sellerProfiles: input.sellerProfiles,

  };



  let pool: Listing[] = input.visibleListings;



  if (input.agentPinnedListingIds !== null) {

    if (input.agentPinnedListingIds.length === 0) return [];

    const pinned = new Set(input.agentPinnedListingIds);

    pool = pool.filter((l) => pinned.has(l.id));

  }



  let results = rankListings(
    pool,
    effectiveMarketplaceSearchQuery(input.searchQuery),
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



  const q = effectiveMarketplaceSearchQuery(input.searchQuery).trim();

  if (q && portalThemeForQuery(q) !== "flux") {

    results = portalRankedListings(q, results);

  }



  // Agent pin IDs are authoritative — do not wipe them with a soft category filter
  // (server already ranked by category; hard UI category was emptying the grid).
  const pinSafeFilters =
    input.agentPinnedListingIds !== null && input.agentPinnedListingIds.length > 0
      ? { ...filters, category: "all" as const }
      : filters;

  const facetParsed = filters.facetQueryString
    ? parseFacetSearchParams(filters.facetQueryString)
    : null;
  const filtersForMarketplace =
    facetParsed?.ok && facetParsed.query.verticalId
      ? { ...pinSafeFilters, category: "all" as const }
      : pinSafeFilters;

  results = applyMarketplaceFilters(results, filtersForMarketplace, input.buyerCoords);

  if (
    facetParsed?.ok &&
    (facetParsed.query.verticalId || facetParsed.query.predicates.length > 0)
  ) {
    results = applyFacetFilters(results, facetParsed.query) as ScoredListing[];
    if (facetParsed.query.sort !== "relevance") {
      results = sortFacetListings(results, facetParsed.query.sort) as ScoredListing[];
    }
  }

  const effectiveSort =

    filters.sort !== "relevance"

      ? filters.sort

      : sortMode === "default"

        ? "relevance"

        : sortMode;



  return prioritizeFeedTiers(applyMarketplaceSort(results, effectiveSort));

}



function buildNationwideFallback(

  input: DisplayListingsInput,

  localFilters: MarketplaceFilterState

): ScoredListing[] {

  if (!hasGeoFilter(localFilters) || !hasProductSearchIntent(input)) {

    return [];

  }



  return runDisplayPipeline({

    ...input,

    agentPinnedListingIds: null,

    marketplaceFilters: {

      ...localFilters,

      location: "",

      radiusKm: null,

    },

  });

}



/**

 * Single marketplace results pipeline — pins, bubbles, and FilterBar filters

 * are combined with AND logic. When local geo returns 0, nationwide fallback

 * surfaces the same product elsewhere in Lithuania.

 */

export function buildDisplayListings(

  input: DisplayListingsInput

): DisplayListingsResult {

  const localFilters = normalizeMarketplaceFilters(input.marketplaceFilters);



  if (

    input.agentPinnedListingIds !== null &&

    input.agentPinnedListingIds.length === 0

  ) {

    if (resolveBrowseAllIntent(input.searchQuery)) {

      return {

        listings: runDisplayPipeline({

          ...input,

          agentPinnedListingIds: null,

          searchQuery: "",

        }),

        fallbackListings: [],

      };

    }

    return { listings: [], fallbackListings: [] };

  }



  const listings = runDisplayPipeline(input);



  if (listings.length > 0) {

    return { listings, fallbackListings: [] };

  }



  const fallbackListings = buildNationwideFallback(input, localFilters);

  return { listings, fallbackListings };

}


