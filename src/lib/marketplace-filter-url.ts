import {
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
  type MarketplaceRadiusKm,
  type MarketplaceSortMode,
} from "@/lib/marketplace-view";
import { categoryFilterFieldsFor } from "@/lib/category-attribute-filters";
import type { ListingCategory } from "@/lib/types";
// 13A canonical vertical registry — single source of truth for vertical → category.
import { listingCategoryForVertical, type FacetSortId } from "@vauto/shared/marketplace-domain";
// 13B canonical query parser — used read-only to know which search-URL params the
// canonical layer owns, so the complementary strip never deletes a 13B predicate.
import {
  getFilterableAttributes,
  listingCategoriesForVertical,
  parseFacetSearchParams,
  resolveVerticalId,
  serializeFacetSearchParams,
  type ParsedFacetQuery,
  type VerticalId,
} from "@vauto/shared/marketplace-domain";

/**
 * Stage 18.3 — frontend-only URL serialization adapter.
 *
 * The 13B canonical `facetQueryString` (`useCanonicalFacetUrl` /
 * `shared/marketplace-domain/facet-query.ts`) only serializes `vertical` + `q`
 * + the shared filterable attribute predicates. It does NOT carry the
 * frontend `MarketplaceFilterState` fields that `applyMarketplaceFilters`
 * actually consumes on the client: `location` (for most verticals),
 * `priceMin`/`priceMax`, `condition`, `radiusKm` and the vertical
 * `categoryAttributes` (rooms, propertyType, locationType, ...).
 *
 * This adapter adds a complementary, origin-agnostic URL layer so those AI /
 * classic facets survive reload and deep-link without re-running AI
 * interpretation (Stage 18.3 §3). It deliberately does NOT modify the shared
 * 13A `VERTICAL_ATTRIBUTES` or 13B facet rules — it only mirrors the existing
 * frontend filter state into search-URL params and back, re-validating every
 * value through the existing production allowlists.
 *
 * URL params introduced:
 *   location=<city>            (from filters.location)
 *   price_min=<n> / price_max=<n>
 *   condition=new|used
 *   radius=5|10|20|50
 *   sort=cheapest|newest
 *   ca_<categoryAttributeKey>=<value>  (one per active categoryAttributes entry)
 */
export const CA_PARAM_PREFIX = "ca_";

/**
 * The frontend-owned complementary param keys that this adapter is authoritative
 * over. These are exactly the fields `applyMarketplaceFilters` consumes (AI +
 * classic facets). The serializer REPLACES them from the current state — a stale
 * value (e.g. a removed priceMax / location / chip) never survives in the URL.
 * Keys that the canonical 13B layer owns in the same query (e.g. a `location`
 * predicate for REAL_ESTATE/JOBS, or `sort`) are NOT stripped (see
 * `owned13bKeys`), so canonical semantics stay untouched.
 */
export const COMPLEMENTARY_PARAMS: readonly string[] = [
  "location",
  "price_min",
  "price_max",
  "condition",
  "radius",
  "sort",
];

/** Make the value safe to inline as a URL search param. */
function enc(value: string): string {
  return value
    .replace(/^\s+|\s+$/g, "")
    .normalize("NFKC")
    .trim();
}

/** Round-trip a category attribute key through the URL prefix. */
export function encodeCaKey(key: string): string {
  return `${CA_PARAM_PREFIX}${key}`;
}

export function isCaParam(key: string): boolean {
  return key.startsWith(CA_PARAM_PREFIX);
}

export function decodeCaKey(param: string): string {
  return param.slice(CA_PARAM_PREFIX.length);
}

const RADIUS_VALUES: readonly MarketplaceRadiusKm[] = [5, 10, 20, 50];

function serializableCategory(category: ListingCategory | "all"): boolean {
  return category !== "all";
}

/**
 * The set of search-URL keys that the canonical 13B layer currently owns in
 * `params` (the URL state being written): `vertical`, `q`, `page`, `limit`,
 * `sort` (when non-relevance) and every predicate key (including `_min`/`_max`
 * range suffixes).
 *
 * To recognise these reliably, `params` is first scrubbed of the COMPLEMENT-ONLY
 * keys — `price_min`, `price_max`, `radius` and every `ca_*` — which the canonical
 * 13B schema never declares as filterable facets. Without the scrub,
 * `parseFacetSearchParams` rejects the whole string as containing an
 * "unknown_facet" and would therefore fail to recognise genuine 13B predicates
 * (e.g. `condition=Naudotas`, `location=X`, `rooms_min`) that must be preserved.
 * `location`, `condition` and `sort` are deliberately kept for parsing because the
 * canonical layer DOES own them as predicates.
 */
function owned13bKeys(params: URLSearchParams): Set<string> {
  const keys = new Set<string>(["vertical", "q", "page", "limit"]);
  if (!params.size) return keys;
  const scrubbed = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === "price_min" || key === "price_max" || key === "radius" || isCaParam(key)) {
      continue;
    }
    scrubbed.append(key, value);
  }
  const result = parseFacetSearchParams(scrubbed.toString());
  if (result.ok) {
    if (result.query.sort !== "relevance") keys.add("sort");
    for (const pred of result.query.predicates) {
      keys.add(pred.key);
      keys.add(`${pred.key}_min`);
      keys.add(`${pred.key}_max`);
    }
  }
  return keys;
}

/**
 * Decide whether a complementary param key currently in `params` should be
 * REMOVED because it is no longer active in the authoritative `filters` state
 * (State 18.3.1 replacement semantics).
 *
 * Stripping is restricted to:
 *  - price/radius/category-attr keys: owned ONLY by the complement (13B never writes
 *    `price_min`, `price_max`, `radius`, or `ca_*`), so an inactive state value
 *    is always safe to remove.
 *  - `condition` / `sort`: removed only when the complement itself authored the
 *    current value (value domain disambiguation, e.g. `condition=used` clears but
 *    the 13B predicate `condition=Naudotas` is preserved).
 *  - `location`: the complement `filters.location` is the authoritative mirror of
 *    the URL `location` (the canonical hydrate path reads a `location` predicate
 *    straight back into `filters.location`). An empty `filters.location` means the
 *    landing/current URL value is a stale complementary leftover and is removed.
 *
 * Canonical keys (`vertical`, `q`, `page`, `limit`, and every genuine 13B
 * predicate, including `condition`/`location` predicates the canonical parser
 * accepts) are never stripped.
 */
function shouldStripComplement(key: string, filters: MarketplaceFilterState): boolean {
  if (key === "condition") {
    return filters.condition === "all";
  }
  if (key === "sort") {
    return filters.sort !== "cheapest" && filters.sort !== "newest";
  }
  if (key === "location") {
    return enc(filters.location) === "";
  }
  // price_min / price_max / radius / ca_* — complement-owned only.
  return true;
}

/**
 * Write the complementary `MarketplaceFilterState` params onto an existing
 * search-URL builder, REPLACING (not appending) the frontend-owned complement.
 *
 * Replacement semantics (Stage 18.3.1):
 *  1. Copy the incoming params (13B canonical `vertical`/`q`/predicates stay).
 *  2. Deterministically strip every complementary param that is no longer active
 *     in the current state (price, radius, kind-of-the-week, condition/sort whose
 *     complement is inactive, an empty `location`). Genuine 13B predicates the
 *     canonical parser accepts (e.g. `condition=Naudotas`, `location=<city>`,
 *     `rooms_min`, `q`, `vertical`) are preserved verbatim.
 *  3. Write back only the currently-active, allowlisted facets.
 *
 * Net effect: a removed facet (priceMax=null, location="", condition="all",
 * rooms chip removed, ...) deterministically disappears from the URL, so reload /
 * deep-link cannot resurrect stale complementary filters.
 */
export function serializeMarketplaceFiltersIntoUrl(
  filters: MarketplaceFilterState,
  params: URLSearchParams
): URLSearchParams {
  const next = new URLSearchParams(params);
  const owned13b = owned13bKeys(params);

  // Strip stale/removed frontend complement, preserving genuine 13B predicates.
  // `location` and `sort` are governed purely by their authoritative complement
  // mirrors (`filters.location` / `filters.sort`); the 13B panel keeps them in
  // sync via commit, so an active canonical location/sort is re-written below
  // rather than lost, and a cleared one is deterministically removed.
  const stripScoped = (key: string): boolean =>
    (key === "location" ||
      key === "price_min" ||
      key === "price_max" ||
      key === "condition" ||
      key === "radius" ||
      key === "sort" ||
      isCaParam(key)) &&
    (key === "location" || key === "sort" || !owned13b.has(key)) &&
    shouldStripComplement(key, filters);
  for (const key of Array.from(next.keys())) {
    if (stripScoped(key)) next.delete(key);
  }

  // Re-write only the currently-active, allowlisted facets.
  const loc = enc(filters.location);
  if (loc) next.set("location", loc);

  if (filters.priceMin != null && Number.isFinite(filters.priceMin)) {
    next.set("price_min", String(filters.priceMin));
  }
  if (filters.priceMax != null && Number.isFinite(filters.priceMax)) {
    next.set("price_max", String(filters.priceMax));
  }

  if (filters.condition === "new" || filters.condition === "used") {
    next.set("condition", filters.condition);
  }

  if (filters.radiusKm != null && RADIUS_VALUES.includes(filters.radiusKm)) {
    next.set("radius", String(filters.radiusKm));
  }

  if (filters.sort === "cheapest" || filters.sort === "newest") {
    next.set("sort", filters.sort);
  }

  // Category attributes, allowlisted for the current category.
  const allowed =
    serializableCategory(filters.category)
      ? new Set(categoryFilterFieldsFor(filters.category).map((f) => f.key))
      : new Set<string>();
  for (const [key, value] of Object.entries(filters.categoryAttributes ?? {})) {
    const v = enc(value);
    if (!v || !allowed.has(key)) continue;
    next.set(encodeCaKey(key), v);
  }

  return next;
}

/**
 * Inverse of `serializeMarketplaceFiltersIntoUrl`. Returns a partial
 * `MarketplaceFilterState` with only the fields that round-trip cleanly.
 * Every value is re-validated through production allowlists so a hostile or
 * stale URL cannot inject a facet the current category cannot consume.
 */
export function parseMarketplaceFiltersFromUrl(
  params: URLSearchParams,
  category: ListingCategory | "all"
): Partial<MarketplaceFilterState> {
  const out: Partial<MarketplaceFilterState> = {};

  const location = enc(params.get("location") ?? "");
  if (location) out.location = location;

  const priceMinRaw = params.get("price_min");
  if (priceMinRaw !== null) {
    const priceMin = Number(priceMinRaw);
    if (Number.isFinite(priceMin) && priceMin >= 0) out.priceMin = priceMin;
  }

  const priceMaxRaw = params.get("price_max");
  if (priceMaxRaw !== null) {
    const priceMax = Number(priceMaxRaw);
    if (Number.isFinite(priceMax) && priceMax >= 0) out.priceMax = priceMax;
  }

  const condition = params.get("condition");
  if (condition === "new" || condition === "used") out.condition = condition;

  const radiusRaw = Number(params.get("radius"));
  if (RADIUS_VALUES.includes(radiusRaw as MarketplaceRadiusKm)) {
    out.radiusKm = radiusRaw as MarketplaceRadiusKm;
  }

  const sort = params.get("sort");
  if (sort === "cheapest" || sort === "newest") out.sort = sort;

  if (serializableCategory(category)) {
    const allowed = new Set(categoryFilterFieldsFor(category).map((f) => f.key));
    const attrs: Record<string, string> = {};
    for (const key of Array.from(params.keys())) {
      if (!isCaParam(key)) continue;
      const caKey = decodeCaKey(key);
      if (!allowed.has(caKey)) continue;
      const v = enc(params.get(key) ?? "");
      if (v) attrs[caKey] = v;
    }
    if (Object.keys(attrs).length) out.categoryAttributes = attrs;
  }

  return out;
}

/**
 * Combine the 13B `facetQueryString` and the complementary `MarketplaceFilterState`
 * params into one canonical search URL and commit it via `history.replaceState`
 * (identical to `useCanonicalFacetUrl.writeSearch`). No-op when the resulting
 * href equals the current one, so transient re-renders never rewrite the URL.
 */
export function syncMarketplaceFiltersToUrl(filters: MarketplaceFilterState): void {
  if (typeof window === "undefined") return;

  let params = new URLSearchParams(filters.facetQueryString || "");
  // serializeMarketplaceFiltersIntoUrl returns the augmented param set — carry it
  // forward (it returns a copy rather than mutating the input).
  params = serializeMarketplaceFiltersIntoUrl(filters, params);

  // Keep q param in sync when present, mirroring 13B serialization.
  const next = `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState(window.history.state, "", next);
  }
}

/** Normalize a partial state for safe comparison / defaulting. */
export function normalizePartial(
  partial: Partial<MarketplaceFilterState>
): MarketplaceFilterState {
  return normalizeMarketplaceFilters(partial);
}

/**
 * Resolve the canonical listing category for a drawer/facet query, mirroring the
 * 13A `listingCategoryForVertical` adapter used by the AI write bridge.
 */
export function categoryForVerticalId(
  verticalId: string | null | undefined,
  fallback: ListingCategory | "all"
): ListingCategory | "all" {
  if (!verticalId) return fallback;
  // 13A canonical vertical registry is the single source of truth; the returned
  // string is a valid `ListingCategory` id (matching the AI adapter's cast).
  return (listingCategoryForVertical(verticalId as never) as ListingCategory) ?? fallback;
}

/**
 * Drop any `categoryAttributes` entries that the given category's canonical
 * schema does not allow (re-validated through `categoryFilterFieldsFor`). Used on
 * vertical switch so a REAL_ESTATE `rooms`/`propertyType` facet can never leak
 * into an ELECTRONICS/SERVICES/JOBS state (Stage 18.3 §5).
 */
export function coerceCategoryAttributesToCategory(
  filters: MarketplaceFilterState,
  category: ListingCategory | "all"
): MarketplaceFilterState {
  if (category === "all") {
    return { ...filters, category, categoryAttributes: {} };
  }
  const allowed = new Set(categoryFilterFieldsFor(category).map((f) => f.key));
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters.categoryAttributes ?? {})) {
    const v = enc(value);
    if (v && allowed.has(key)) attrs[key] = v;
  }
  return { ...filters, category, categoryAttributes: attrs };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 18.3.2 — DERIVED CANONICAL COMPLEMENT MIRROR
//
// Pure derivation helpers shared by `useCanonicalFacetUrl.commit()` and the unit
// suite. The SAME derived `location` / `sort` value is fed to
// `serializeMarketplaceFiltersIntoUrl()` and `setMarketplaceFilters()`, so the
// URL and the committed state agree on the same write (no one-write-lag).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the canonical `location` predicate value from a `facetQueryString`, or
 * `undefined` when the canonical layer currently holds no location predicate.
 *
 * Complement-only keys (`price_min`, `price_max`, `radius`, `ca_*`) are scrubbed
 * first so `parseFacetSearchParams` succeeds and still recognises a genuine
 * `location` predicate even inside a 13B+complement composite string. A
 * complement-only location authored via AI chips / classic FilterFields is not
 * represented as a canonical predicate here, so it returns `undefined`.
 */
export function canonicalLocationPredicate(
  facetQueryString: string
): string | undefined {
  if (!facetQueryString) return undefined;
  const scrubbed = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(facetQueryString)) {
    if (
      key === "price_min" ||
      key === "price_max" ||
      key === "radius" ||
      key.startsWith(CA_PARAM_PREFIX)
    ) {
      continue;
    }
    scrubbed.append(key, value);
  }
  const result = parseFacetSearchParams(scrubbed.toString());
  if (!result.ok) return undefined;
  const location = result.query.predicates.find((p) => p.kind === "location") as
    | { kind: "location"; key: string; value: string }
    | undefined;
  const locationContains = result.query.predicates.find(
    (p) => p.kind === "contains" && p.key === "location"
  ) as { kind: "contains"; key: string; value: string } | undefined;
  return location?.value ?? locationContains?.value;
}

/**
 * Derive the mirror `filters.location` a canonical `commit` should write.
 *
 * The canonical `location` predicate in the next query is authoritative while
 * present. When it is REMOVED, any previously canonical location is cleared
 * (`""`) rather than falling back to a stale `prevLocation`. A complement-only
 * location (never present as a canonical predicate in the previous query) is
 * preserved. Purely derived / deterministic — reload-safe.
 */
export function deriveCanonicalLocationMirror(
  prevFacetQueryString: string,
  prevLocation: string | undefined | null,
  nextCanonicalLocation: string | undefined
): string {
  if (nextCanonicalLocation !== undefined) return nextCanonicalLocation;
  if (canonicalLocationPredicate(prevFacetQueryString) !== undefined) {
    return "";
  }
  return prevLocation ?? "";
}

/**
 * Map the 13B canonical `sort` (`price_asc` / `newest` / `price_desc` /
 * `relevance`) onto the frontend complement sort, BEFORE URL serialization, so a
 * canonical sort change/clear is reflected in the URL on the same write.
 */
export function deriveCanonicalSortMirror(
  nextSort: FacetSortId
): MarketplaceSortMode {
  if (nextSort === "price_asc") return "cheapest";
  if (nextSort === "newest") return "newest";
  return "relevance";
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 22C — CROSS-VERTICAL CONTINUITY (deterministic vertical transition)
//
// Vertical switching must be deterministic: valid canonical state survives,
// vertical-specific state is pruned. Every allowlist below is derived from the
// canonical 13A/13B registry — no second category registry is introduced.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The set of canonical attribute keys filterable for a vertical id (13A
 * `getFilterableAttributes`), as a plain string set for O(1) predicate checks.
 * Returns an empty set for an unknown/null vertical (fail-closed — nothing is
 * kept when the target cannot be resolved).
 */
export function filterableFacetKeysForVerticalId(
  verticalId: string | null | undefined
): Set<string> {
  const id = resolveVerticalId(verticalId ?? "") ?? null;
  if (!id) return new Set<string>();
  return new Set(getFilterableAttributes(id).map((a) => a.key));
}

/**
 * Whether the canonical 13B vertical schema declares a filterable `location`
 * attribute. REAL_ESTATE and JOBS own a canonical `location`; TRANSPORT,
 * ELECTRONICS, SERVICES, HOME_GARDEN do not (geography is expressed via the
 * complementary `filters.location` for services/transport/goods).
 */
export function verticalOwnsCanonicalLocationFacet(
  verticalId: string | null | undefined
): boolean {
  return filterableFacetKeysForVerticalId(verticalId).has("location");
}

/**
 * Prune a canonical 13B `ParsedFacetQuery` against the target vertical's
 * filterable attribute schema (Stage 22C R2/R9).
 *
 * Deterministic rules:
 *  - predicates whose key is NOT filterable in the target vertical are dropped
 *    (e.g. REAL_ESTATE `propertyType`/`rooms` must never leak into
 *    ELECTRONICS/SERVICES/JOBS/HOME_GARDEN);
 *  - the canonical `location` predicate is kept ONLY when the target vertical
 *    owns a filterable `location` attribute (REAL_ESTATE/JOBS);
 *  - global canonical state (`q`, `sort`, `page`) is preserved verbatim.
 *
 * The vertical itself is left to the caller so this helper stays a pure
 * predicate/prune function; a `null`/unresolvable target prunes all predicates
 * (fail-closed — an unknown vertical cannot keep vertical-specific facets).
 */
export function pruneFacetPredicatesForVertical(
  query: ParsedFacetQuery,
  targetVerticalId: VerticalId | null | undefined
): ParsedFacetQuery {
  const allowed = filterableFacetKeysForVerticalId(targetVerticalId);
  const keepLocation = verticalOwnsCanonicalLocationFacet(targetVerticalId);
  const predicates = query.predicates.filter((pred) => {
    if (pred.kind === "location") return keepLocation;
    return allowed.has(pred.key);
  });
  return { ...query, predicates, page: 1 };
}

/**
 * Full deterministic vertical-transition for the frontend
 * `MarketplaceFilterState` + its 13B `facetQueryString` (Stage 22C R2/R9).
 *
 * Combines the canonical predicate pruning with the frontend complement
 * pruning into ONE deterministic transition:
 *  1. Set the target vertical on the canonical query and prune its predicates
 *     to the target vertical's filterable schema — the canonical `location`
 *     predicate survives only for REAL_ESTATE/JOBS (they own a filterable
 *     `location`); TRANSPORT/ELECTRONICS/SERVICES/HOME_GARDEN express geography
 *     via the complementary `filters.location`, so the complement location is
 *     PRESERVED (certified 18.3.2 complement semantics).
 *  2. Drop `categoryAttributes` the target category does not allow (reuses the
 *     certified `coerceCategoryAttributesToCategory`).
 *  3. Preserve global state: query, location (complement), price bounds,
 *     condition, sort, radius.
 *
 * The returned state keeps the caller's `category` when it is a real category
 * and the target resolves to it; when the caller passes an explicit new
 * category it wins. Compatible state survives; incompatible state is pruned.
 */
export function transitionMarketplaceFiltersToVertical(
  filters: MarketplaceFilterState,
  target: {
    verticalId: VerticalId | null | undefined;
    category: ListingCategory | "all";
  }
): MarketplaceFilterState {
  const currentQuery = filters.facetQueryString
    ? parseFacetSearchParams(filters.facetQueryString)
    : null;
  const prunedQuery = currentQuery?.ok
    ? pruneFacetPredicatesForVertical(
        { ...currentQuery.query, verticalId: target.verticalId ?? null },
        target.verticalId
      )
    : null;

  const coerced = coerceCategoryAttributesToCategory(filters, target.category);

  const base = {
    ...filters,
    ...coerced,
    category: target.category,
  };
  if (prunedQuery) {
    base.facetQueryString = serializeFacetSearchParams(prunedQuery).toString();
  }
  return normalizeMarketplaceFilters(base);
}

/**
 * Resolve the canonical marketplace listing category for a vertical the way the
 * production AI adapter does: the operational marketplace segment ("vehicles"
 * for TRANSPORT) is authoritative over the raw listing-kind string, so the
 * frontend filter category and the AI interpretation agree on ONE value.
 */
export function canonicalMarketplaceCategoryForVertical(
  verticalId: VerticalId | null
): ListingCategory | "all" {
  if (!verticalId) return "all";
  const raw = listingCategoryForVertical(verticalId) as ListingCategory;
  const categories = listingCategoriesForVertical(verticalId).map(
    (c) => c as ListingCategory
  );
  if (verticalId === "TRANSPORT" && categories.includes("vehicles")) return "vehicles";
  if (categories.includes(raw)) return raw;
  return categories[0] ?? raw;
}

/**
 * Convenience: transition using a canonical `VerticalId` and its canonical
 * marketplace listing category (single registry lookup — never a second
 * taxonomy). The operational category resolution mirrors the AI adapter
 * (TRANSPORT → "vehicles"), so manual switching and AI interpretation always
 * converge on the same canonical category.
 */
export function transitionMarketplaceFiltersToVerticalId(
  filters: MarketplaceFilterState,
  verticalId: VerticalId | null
): MarketplaceFilterState {
  const category = canonicalMarketplaceCategoryForVertical(verticalId);
  return transitionMarketplaceFiltersToVertical(filters, { verticalId, category });
}
