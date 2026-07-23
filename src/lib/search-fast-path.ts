/** Client barrel — search fast-path + NLP intent isolation. */
export {
  SEARCH_SQL_TIMEOUT_MS,
  applyStrictSearchBoundaries,
  extractSearchNlFilters,
  isPhysicalGoodsQuery,
  isRevealActiveResultsIntent,
  isResultSelectionIntent,
  isSearchTopicPivot,
  isServicesDominantQuery,
  listingPathForId,
  resolveRecentListingSelection,
  significantTokens,
  type RecentListingPick,
  type SearchNlFilters,
} from "@vauto/shared/search-fast-path";
