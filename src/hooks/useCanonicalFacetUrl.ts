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
import {
  serializeMarketplaceFiltersIntoUrl,
  parseMarketplaceFiltersFromUrl,
  deriveCanonicalLocationMirror,
  deriveCanonicalSortMirror,
} from "@/lib/marketplace-filter-url";
import { normalizeMarketplaceFilters } from "@/lib/marketplace-view";
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
      let params = serializeFacetSearchParams({ ...next, q: next.q });
      const category = next.verticalId
        ? (listingCategoryForVertical(next.verticalId) as ListingCategory)
        : ("all" as const);
      // Stage 18.3 — a vertical change must drop attribute facets incompatible
      // with the new canonical vertical (18.3-E/G), so stale RE-only chips
      // never leak into the next vertical's state or URL. Mirrors the AI
      // adapter's vertical-reset (applyAiFacet vertical case).
      const attributesForCategory =
        category === marketplaceFilters.category
          ? marketplaceFilters.categoryAttributes ?? {}
          : {};
      // Stage 18.3.2 — build ONE derived complement state before serialization so
      // the serializer and setMarketplaceFilters() agree (no one-write-lag).
      //
      // Derived sort: the canonical `sort` is mapped to the frontend complement
      // sort up-front, and the SAME value feeds both the URL serializer and the
      // committed state — so a canonical sort clear/change is reflected in the
      // URL before the next render, and a cleared sort vanishes on reload.
      const derivedSort = deriveCanonicalSortMirror(next.sort);
      // Derived location mirror. The canonical `location` predicate is the
      // authority for the mirror while it is present in `next`. When it is
      // removed, the canonical location is CLEARED — we do not fall back to stale
      // `marketplaceFilters.location`. A complement-only location (authored via
      // AI chips / classic FilterFields, never entered the canonical query) is
      // preserved because the previous canonical query never held a location
      // predicate for it.
      const nextLocation =
        (next.predicates.find((p) => p.kind === "location") as
          | { kind: "location"; key: string; value: string }
          | undefined)?.value ??
        (next.predicates.find((p) => p.kind === "contains" && p.key === "location") as
          | { kind: "contains"; key: string; value: string }
          | undefined)?.value;
      const derivedLocation = deriveCanonicalLocationMirror(
        marketplaceFilters.facetQueryString,
        marketplaceFilters.location,
        nextLocation
      );

      const derivedState = {
        ...marketplaceFilters,
        category,
        categoryAttributes: attributesForCategory,
        location: derivedLocation,
        sort: derivedSort,
      };
      // Mirror the client filter state (location/price/condition/radius/chameleon
      // attrs) into the same search URL so AI/classic facets survive reload &
      // deep-link without re-running AI interpretation. Allowlist against the
      // target category so incompatible attributes are never written.
      params = serializeMarketplaceFiltersIntoUrl(derivedState, params);
      writeSearch(params);
      setMarketplaceFilters({
        ...derivedState,
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
    const rawParams = new URLSearchParams(raw);
    const cleaned = canonicalizeFacetSearchParams(rawParams);
    writeSearch(cleaned);
    const result = parseFacetSearchParams(cleaned);
    if (!result.ok) {
      // Even an invalid 13B string can carry complementary client facets; the
      // category defaults to "all", so only agnostic fields restore.
      const restored = parseMarketplaceFiltersFromUrl(rawParams, "all");
      const nextParams = serializeMarketplaceFiltersIntoUrl(
        normalizeMarketplaceFilters({
          ...marketplaceFilters,
          ...restored,
          category: "all",
        }),
        cleaned
      );
      writeSearch(nextParams);
      setMarketplaceFilters({
        ...marketplaceFilters,
        ...restored,
        category: "all",
        facetQueryString: nextParams.toString(),
      });
      const q = cleaned.get("q");
      if (q) setSearchQuery(q);
      return;
    }
    // Rebuild the 13B params, then RE-ADD the complementary frontend facets read
    // from the ORIGINAL URL params (canonicalize drops non-13B keys), so a
    // reload/deep-link URL keeps the full canonical state (Stage 18.3 §3) and
    // the UI restores those facets verbatim.
    let params = serializeFacetSearchParams(result.query);
    const category = result.query.verticalId
      ? (listingCategoryForVertical(result.query.verticalId) as ListingCategory)
      : "all";
    const rawRestored = parseMarketplaceFiltersFromUrl(rawParams, category);
    params = serializeMarketplaceFiltersIntoUrl(
      normalizeMarketplaceFilters({
        ...marketplaceFilters,
        ...rawRestored,
        category,
      }),
      params
    );
    writeSearch(params);
    const restored = parseMarketplaceFiltersFromUrl(params, category);
    setMarketplaceFilters({
      ...marketplaceFilters,
      ...restored,
      category,
      facetQueryString: params.toString(),
    });
    if (result.query.q) setSearchQuery(result.query.q);
    // Hydrate once from the landing URL. Later URL writes go through commit().
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once-only deep-link restore
  }, []);
}
