"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  parseFacetSearchParams,
  serializeFacetSearchParams,
  canonicalizeFacetSearchParams,
  clearVerticalFacets,
  resetFacetPage,
  type ParsedFacetQuery,
  type VerticalId,
} from "@vauto/shared/marketplace-domain";
import { useVautoSearch } from "@/context/VautoSearchContext";
import {
  serializeMarketplaceFiltersIntoUrl,
  parseMarketplaceFiltersFromUrl,
  deriveCanonicalLocationMirror,
  deriveCanonicalSortMirror,
  pruneFacetPredicatesForVertical,
  canonicalMarketplaceCategoryForVertical,
  verticalOwnsCanonicalLocationFacet,
} from "@/lib/marketplace-filter-url";
import { interpretAiFacets } from "@/lib/ai-facet-interpretation";
import { applyFacetChips } from "@/lib/apply-ai-facet";
import { normalizeMarketplaceFilters } from "@/lib/marketplace-view";

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
      // Stage 22C — deterministic vertical transition (R2/R9): the canonical
      // layer must NEVER carry a predicate the active vertical cannot filter.
      // Pruning here makes every commit path (setVertical / setQuery / drawer /
      // clearFacets) deterministic: predicates are re-validated against the
      // target vertical's canonical filterable schema, and a `null` vertical
      // prunes all predicates (fail-closed — the 13B parser rejects facets
      // without a vertical anyway).
      const transitioned = pruneFacetPredicatesForVertical(next, next.verticalId);
      let params = serializeFacetSearchParams({ ...transitioned, q: transitioned.q });
      // Stage 22C — the canonical listing category uses the SAME operational
      // resolution as the AI adapter and the transition helper (TRANSPORT →
      // "vehicles"), so manual switching, drawer transitions and AI
      // interpretation converge on ONE category value.
      const category = transitioned.verticalId
        ? canonicalMarketplaceCategoryForVertical(transitioned.verticalId)
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
      const derivedSort = deriveCanonicalSortMirror(transitioned.sort);
      // Derived location mirror. The canonical `location` predicate is the
      // authority for the mirror while it is present in `transitioned`. When it
      // is removed, the canonical location is CLEARED — we do not fall back to
      // stale `marketplaceFilters.location`. A complement-only location
      // (authored via AI chips / classic FilterFields, never entered the
      // canonical query) is preserved because the previous canonical query
      // never held a location predicate for it.
      const nextLocation =
        (transitioned.predicates.find((p) => p.kind === "location") as
          | { kind: "location"; key: string; value: string }
          | undefined)?.value ??
        (transitioned.predicates.find(
          (p) => p.kind === "contains" && p.key === "location"
        ) as
          | { kind: "contains"; key: string; value: string }
          | undefined)?.value;
      // Stage 22C R3/R6 — on a VERTICAL CHANGE the user's complement location
      // survives when the target vertical expresses geography via the complement
      // layer (TRANSPORT/ELECTRONICS/SERVICES/HOME_GARDEN), matching the drawer
      // transition exactly. Same-vertical location clears keep the certified
      // 18.3.2 mirror semantics (canonical removal clears the mirror).
      const prevParsed = parseFacetSearchParams(
        marketplaceFilters.facetQueryString ?? ""
      );
      const prevVerticalId = prevParsed.ok
        ? prevParsed.query.verticalId
        : null;
      const verticalChanged =
        prevVerticalId !== transitioned.verticalId &&
        (prevVerticalId !== null || transitioned.verticalId !== null);
      const targetOwnsCanonicalLocation = verticalOwnsCanonicalLocationFacet(
        transitioned.verticalId
      );
      const derivedLocation =
        verticalChanged && !targetOwnsCanonicalLocation && nextLocation === undefined
          ? marketplaceFilters.location ?? ""
          : deriveCanonicalLocationMirror(
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
      // Mirror the client filter state (location/price/condition/radius/vertical
      // attrs) into the same search URL so AI/classic facets survive reload &
      // deep-link without re-running AI interpretation. Allowlist against the
      // target category so incompatible attributes are never written.
      params = serializeMarketplaceFiltersIntoUrl(derivedState, params);
      writeSearch(params);
      setMarketplaceFilters({
        ...derivedState,
        facetQueryString: params.toString(),
      });
      if (transitioned.q !== searchQuery) setSearchQuery(transitioned.q);
    },
    [marketplaceFilters, searchQuery, setMarketplaceFilters, setSearchQuery]
  );

  const setVertical = useCallback(
    (verticalId: VerticalId | null) => {
      // Stage 22C R3/R4 — deterministic vertical transition: keep the current
      // vertical's predicates that the target vertical CAN filter (shared
      // canonical attributes survive), drop incompatible ones. `commit` re-runs
      // the same prune against the target schema, so this is belt-and-braces
      // for the desktop panel (no draft). Compatible global state (q/sort)
      // survives; page resets to 1.
      const pruned = pruneFacetPredicatesForVertical(
        { ...parsed, verticalId },
        verticalId
      );
      commit(resetFacetPage({ ...pruned, q: searchQuery }));
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
    // Stage 22C §10 — a deep-link can carry BOTH canonical 13B predicates
    // (propertyType=Butas, rooms_min=1) AND complementary frontend params
    // (price_min/price_max/radius/ca_*). The canonical parser rejects
    // complement-only keys as unknown facets, which would poison the whole
    // parse and silently DROP the valid canonical predicates on reload.
    // Scrub the complement-owned keys before canonical parsing (same allowlist
    // as `canonicalLocationPredicate`), then re-add them from `rawParams` via
    // the complement layer — deterministic deep-link → equivalent state.
    const canonicalScrub = new URLSearchParams();
    for (const [key, value] of rawParams) {
      if (
        key === "price_min" ||
        key === "price_max" ||
        key === "radius" ||
        key.startsWith("ca_")
      ) {
        continue;
      }
      canonicalScrub.append(key, value);
    }
    const cleaned = canonicalizeFacetSearchParams(canonicalScrub);
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
      ? canonicalMarketplaceCategoryForVertical(result.query.verticalId)
      : "all";
    const rawRestored = parseMarketplaceFiltersFromUrl(rawParams, category);
    const hydrated = normalizeMarketplaceFilters({
      ...marketplaceFilters,
      ...rawRestored,
      category,
    });
    params = serializeMarketplaceFiltersIntoUrl(hydrated, params);
    writeSearch(params);
    const restored = parseMarketplaceFiltersFromUrl(params, category);

    // Stage 22B remediation (HIGH-2) — settle the canonical URL synchronously
    // during hydration by applying the deterministic AI facet interpretation of
    // the landing query. Without this, `AiInterpretationChips` applies the same
    // facets in a later effect tick (~200ms after first paint), so any actor
    // reading the URL in that window (user navigation, LIST→MAP→LIST, an E2E
    // asserting a settled URL) observes a transient URL mutation. Pre-applying
    // here makes the URL settle before results render, while producing the
    // EXACT same final state (the chips' later effect no-ops via its
    // 21C-1 idempotency guard). The derivation is identical to the chips'
    // production write bridge (`applyFacetChips`), so a deep-link with an
    // explicit facet behaves exactly as it does after the chips settle.
    const q = result.query.q || cleaned.get("q") || "";
    let nextFilters = {
      ...hydrated,
      ...restored,
      facetQueryString: params.toString(),
    };
    if (q.trim()) {
      nextFilters = applyFacetChips(nextFilters, interpretAiFacets(q).chips);
      const settledParams = serializeMarketplaceFiltersIntoUrl(nextFilters, params);
      const settled = parseMarketplaceFiltersFromUrl(settledParams, category);
      writeSearch(settledParams);
      nextFilters = {
        ...nextFilters,
        ...settled,
        facetQueryString: settledParams.toString(),
      };
    }
    setMarketplaceFilters(nextFilters);
    if (q) setSearchQuery(q);
    // Hydrate once from the landing URL. Later URL writes go through commit().
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once-only deep-link restore
  }, []);
}
