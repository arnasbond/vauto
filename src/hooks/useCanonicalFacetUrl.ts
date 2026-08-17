"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  parseFacetSearchParams,
  serializeFacetSearchParams,
  canonicalizeFacetSearchParams,
  clearVerticalFacets,
  resetFacetPage,
  listingCategoryForVertical,
  type ParsedFacetQuery,
  type VerticalId,
} from "@vauto/shared/marketplace-domain";
import { useVautoSearch } from "@/context/VautoSearchContext";
import type { ListingCategory } from "@/lib/types";

function emptyQuery(): ParsedFacetQuery {
  return {
    verticalId: null,
    q: "",
    sort: "relevance",
    page: 1,
    limit: 24,
    predicates: [],
  };
}

function writeSearch(params: URLSearchParams) {
  if (typeof window === "undefined") return;
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState(window.history.state, "", next);
  }
}

export function useCanonicalFacetQuery() {
  const {
    searchQuery,
    setSearchQuery,
    marketplaceFilters,
    setMarketplaceFilters,
  } = useVautoSearch();

  const parsed = useMemo(() => {
    const raw = marketplaceFilters.facetQueryString || "";
    if (!raw) {
      return { ...emptyQuery(), q: searchQuery };
    }
    const result = parseFacetSearchParams(raw);
    if (!result.ok) return { ...emptyQuery(), q: searchQuery };
    return { ...result.query, q: searchQuery || result.query.q };
  }, [marketplaceFilters.facetQueryString, searchQuery]);

  const commit = useCallback(
    (next: ParsedFacetQuery) => {
      const params = serializeFacetSearchParams({ ...next, q: next.q });
      writeSearch(params);
      const category = next.verticalId
        ? (listingCategoryForVertical(next.verticalId) as ListingCategory)
        : "all";
      setMarketplaceFilters({
        ...marketplaceFilters,
        category,
        sort:
          next.sort === "price_asc"
            ? "cheapest"
            : next.sort === "newest"
              ? "newest"
              : "relevance",
        facetQueryString: params.toString(),
      });
      if (next.q !== searchQuery) setSearchQuery(next.q);
    },
    [marketplaceFilters, searchQuery, setMarketplaceFilters, setSearchQuery]
  );

  const setVertical = useCallback(
    (verticalId: VerticalId | null) => {
      commit(
        resetFacetPage({
          ...clearVerticalFacets(parsed),
          verticalId,
          q: searchQuery,
        })
      );
    },
    [commit, parsed, searchQuery]
  );

  const setQuery = useCallback(
    (next: ParsedFacetQuery) => {
      commit(resetFacetPage({ ...next, q: searchQuery }));
    },
    [commit, searchQuery]
  );

  const clearFacets = useCallback(() => {
    commit({
      ...clearVerticalFacets(parsed),
      verticalId: parsed.verticalId,
      q: searchQuery,
    });
  }, [commit, parsed, searchQuery]);

  return { query: parsed, setQuery, setVertical, clearFacets };
}

export function useHydrateFacetUrl() {
  const { marketplaceFilters, setMarketplaceFilters, setSearchQuery } =
    useVautoSearch();
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (typeof window === "undefined") return;
    const raw = window.location.search.replace(/^\?/, "");
    if (!raw) return;
    const cleaned = canonicalizeFacetSearchParams(raw);
    writeSearch(cleaned);
    const result = parseFacetSearchParams(cleaned);
    if (!result.ok) {
      setMarketplaceFilters({
        ...marketplaceFilters,
        category: "all",
        facetQueryString: cleaned.toString(),
      });
      const q = cleaned.get("q");
      if (q) setSearchQuery(q);
      return;
    }
    const params = serializeFacetSearchParams(result.query);
    writeSearch(params);
    const category = result.query.verticalId
      ? (listingCategoryForVertical(result.query.verticalId) as ListingCategory)
      : "all";
    setMarketplaceFilters({
      ...marketplaceFilters,
      category,
      facetQueryString: params.toString(),
    });
    if (result.query.q) setSearchQuery(result.query.q);
    // Hydrate once from the landing URL. Later URL writes go through commit().
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once-only deep-link restore
  }, []);
}
