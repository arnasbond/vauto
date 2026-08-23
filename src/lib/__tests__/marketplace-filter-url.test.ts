import { test } from "node:test";
import assert from "node:assert/strict";
import {
  interpretAiFacets,
} from "@/lib/ai-facet-interpretation";
import {
  applyMarketplaceFilters,
  DEFAULT_MARKETPLACE_FILTERS,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
} from "@/lib/marketplace-view";
import { applyFacetChips, applyAiFacet } from "@/lib/apply-ai-facet";
import {
  serializeMarketplaceFiltersIntoUrl,
  parseMarketplaceFiltersFromUrl,
  syncMarketplaceFiltersToUrl,
  coerceCategoryAttributesToCategory,
  canonicalLocationPredicate,
  deriveCanonicalLocationMirror,
  deriveCanonicalSortMirror,
} from "@/lib/marketplace-filter-url";
import type { Listing, ListingCategory, ScoredListing } from "@/lib/types";

/**
 * Stage 18.3 — AI facet state is URL-persistent and restores deterministically
 * WITHOUT re-running AI interpretation.
 *
 * Production path under test (all real production modules, no test-only
 * semantics):
 *   NL query
 *   → interpretAiFacets (canonical facets)
 *   → applyFacetChips (canonical MarketplaceFilterState)
 *   → serializeMarketplaceFiltersIntoUrl / facetQueryString (URL)
 *   → parseMarketplaceFiltersFromUrl (restore)
 *   → applyMarketplaceFilters (results)
 *
 * A saved page's URL must reproduce the exact same MarketplaceFilterState that
 * drove the results, so reload / deep-link yields identical filters + results
 * without the AI layer.
 */

function makeListing(overrides: Partial<Listing>): ScoredListing {
  return {
    id: "test-1",
    title: "Testas",
    price: 100,
    location: "testas",
    images: [],
    category: "other",
    tags: [],
    sellerId: "seller-test",
    createdAt: "2026-06-01T08:00:00.000Z",
    score: 0,
    semanticRelevance: 0,
    proximityScore: 0,
    priceAttractiveness: 0,
    recencyScore: 0,
    ...overrides,
  };
}

/**
 * Build the full state that the AI chip layer applies for a query, then return
 * it together with the URL params that a saved page would carry (13B
 * facetQueryString isn't produced by ai chips, so we serialize the applied
 * MarketplaceFilterState into the complementary URL layer only).
 */
function appliedUrlRoundTrip(query: string): {
  applied: MarketplaceFilterState;
  params: URLSearchParams;
  restored: MarketplaceFilterState;
} {
  const interpretation = interpretAiFacets(query);
  const chips = interpretation.chips;
  const applied = applyFacetChips(DEFAULT_MARKETPLACE_FILTERS, chips);

  // The complementary URL layer mirrors the applied frontend filter state.
  let params = new URLSearchParams();
  params = serializeMarketplaceFiltersIntoUrl(applied, params);

  // Restore from the URL exactly as useHydrateFacetUrl would (13B parse gives
  // the category; here we derive it from the applied state).
  const restored = normalizeMarketplaceFilters({
    ...DEFAULT_MARKETPLACE_FILTERS,
    ...parseMarketplaceFiltersFromUrl(params, applied.category),
    category: applied.category,
  });

  return { applied, params, restored };
}

test("18.3-A/B/C: AI facets round-trip through the URL layer for all 6 verticals", () => {
  const cases: Array<{ label: string; query: string; category: ListingCategory }> = [
    { label: "TRANSPORT", query: "BMW X5 iki 30000 €", category: "vehicles" },
    {
      label: "REAL_ESTATE",
      query: "2 kambarių butas Vilniuje iki 120000 €",
      category: "real_estate",
    },
    { label: "ELECTRONICS", query: "MacBook Pro iki 1500 €", category: "electronics" },
    { label: "SERVICES", query: "Reikia santechniko Vilniuje", category: "services" },
    {
      label: "JOBS",
      query: "Ieškau programuotojo darbo nuotoliu",
      category: "jobs",
    },
    {
      label: "OTHER_GOODS/HOME_GARDEN",
      query: "Naudotas dviratis iki 500 €",
      category: "home",
    },
  ];

  for (const c of cases) {
    const { applied, params, restored } = appliedUrlRoundTrip(c.query);
    assert.equal(applied.category, c.category, `[${c.label}] vertical`);
    assert.ok(params.size > 0, `[${c.label}] URL carries complementary facets`);
    // Restored state must preserve the AI facet fields, without AI re-run.
    assert.equal(restored.category, applied.category, `[${c.label}] restored category`);
    assert.equal(restored.location, applied.location, `[${c.label}] restored location`);
    assert.equal(restored.priceMax, applied.priceMax, `[${c.label}] restored priceMax`);
    assert.equal(restored.condition, applied.condition, `[${c.label}] restored condition`);
    assert.deepEqual(
      restored.categoryAttributes ?? {},
      applied.categoryAttributes ?? {},
      `[${c.label}] restored categoryAttributes`
    );
  }
});

test("18.3-A: serialized URL params reflect the active AI facet fields", () => {
  const { applied } = appliedUrlRoundTrip(
    "2 kambarių butas Vilniuje iki 120000 €"
  );
  const params = serializeMarketplaceFiltersIntoUrl(applied, new URLSearchParams());

  assert.equal(params.get("location"), "Vilnius", "location persisted");
  assert.equal(params.get("price_max"), "120000", "priceMax persisted");
  const rooms = applied.categoryAttributes?.rooms;
  if (rooms) {
    assert.equal(params.get("ca_rooms"), rooms, "rooms category attr persisted");
  }
});

test("18.3-A: serialization rejects params outside the current category schema", () => {
  // An ELECTRONICS state must NOT carry real-estate-only ca_rooms.
  const applied = applyAiFacet(
    {
      ...DEFAULT_MARKETPLACE_FILTERS,
      category: "electronics",
      categoryAttributes: { condition: "Naudotas" },
    },
    { type: "attribute", key: "rooms", value: "2" }
  );
  const params = serializeMarketplaceFiltersIntoUrl(applied, new URLSearchParams());
  assert.equal(params.get("ca_rooms"), null, "rooms is not filterable for ELECTRONICS");
  // Restoring an invalid ca_rooms for ELECTRONICS must drop it.
  const bad = new URLSearchParams("ca_rooms=2&location=Vilnius&price_max=1500");
  const restored = normalizeMarketplaceFilters({
    ...DEFAULT_MARKETPLACE_FILTERS,
    ...parseMarketplaceFiltersFromUrl(bad, "electronics"),
    category: "electronics",
  });
  assert.equal(
    restored.categoryAttributes?.rooms,
    undefined,
    "invalid rooms dropped"
  );
  // `location` is a base frontend filter applied on the listing's location for
  // every category (see applyMarketplaceFilters), so it is vertical-agnostic and
  // intentionally preserved; price_max is agnostic too.
  assert.equal(restored.location, "Vilnius", "location is agnostic and restored");
  assert.equal(restored.priceMax, 1500, "price_max is agnostic and restored");
});

test("18.3-D: AI facets + classic priceMax edit coexist and both persist to URL", () => {
  const base = appliedUrlRoundTrip("2 kambarių butas Vilniuje iki 120000 €").restored;
  // User edits classic priceMax (same canonical field) — state-bound, no AI.
  const edited = normalizeMarketplaceFilters({ ...base, priceMax: 90000 });
  const params = serializeMarketplaceFiltersIntoUrl(edited, new URLSearchParams());
  assert.equal(params.get("price_max"), "90000", "edited price persisted");
  assert.equal(params.get("ca_rooms"), edited.categoryAttributes?.rooms ?? "2");
  assert.equal(params.get("location"), "Vilnius");
  // Restore from URL after the edit.
  const restored = normalizeMarketplaceFilters({
    ...DEFAULT_MARKETPLACE_FILTERS,
    ...parseMarketplaceFiltersFromUrl(params, edited.category),
    category: edited.category,
  });
  assert.equal(restored.priceMax, 90000);
  assert.equal(restored.location, "Vilnius");
  assert.equal(
    restored.categoryAttributes?.rooms,
    edited.categoryAttributes?.rooms
  );
});

test("18.3-G: second AI query cleans previous incompatible facets", () => {
  const first = appliedUrlRoundTrip("2 kambarių butas Vilniuje iki 120000 €").applied;
  // applyAiFacet resets categoryAttributes when the vertical changes.
  const second = applyFacetChips(
    normalizeMarketplaceFilters({ category: first.category }),
    interpretAiFacets("MacBook Pro iki 1500 €").chips
  );
  assert.equal(second.category, "electronics");
  const url = serializeMarketplaceFiltersIntoUrl(
    normalizeMarketplaceFilters({ ...second, category: "electronics" }),
    new URLSearchParams()
  );
  assert.ok(!url.has("ca_rooms"), "RE rooms cleaned by second query");
  assert.ok(!url.has("ca_propertyType"), "RE propertyType cleaned");
});

test("18.3-H: zero-results state stays serializable/editable (no auto facet drop)", () => {
  const state = normalizeMarketplaceFilters({
    category: "real_estate",
    location: "Neegzistuojantis miestas",
    priceMax: 1,
    categoryAttributes: { propertyType: "Butas", rooms: "2" },
  });
  const url = serializeMarketplaceFiltersIntoUrl(state, new URLSearchParams());
  assert.equal(url.get("location"), "Neegzistuojantis miestas", "criteria kept");
  assert.equal(url.get("ca_rooms"), "2", "rooms kept");
  const restored = normalizeMarketplaceFilters({
    ...DEFAULT_MARKETPLACE_FILTERS,
    ...parseMarketplaceFiltersFromUrl(url, "real_estate"),
    category: "real_estate",
  });
  assert.equal(restored.priceMax, 1, "price kept");
  assert.equal(restored.location, "Neegzistuojantis miestas", "location kept");
  assert.equal(restored.categoryAttributes?.rooms, "2", "rooms kept");
  // Results stay empty — nothing silently widened.
  const empty = applyMarketplaceFilters([], restored, null);
  assert.equal(empty.length, 0);
});

test("18.3-E: vertical switch serializes only the new vertical's compatible facets", () => {
  const re = normalizeMarketplaceFilters({
    category: "real_estate",
    location: "Vilnius",
    categoryAttributes: { rooms: "2", propertyType: "Butas", furnishing: "Įrengtas" },
  });
  const reUrl = serializeMarketplaceFiltersIntoUrl(re, new URLSearchParams());
  assert.ok(reUrl.has("ca_rooms"), "RE rooms serialized");
  assert.ok(reUrl.has("ca_propertyType"), "RE propertyType serialized");

  // Switch to ELECTRONICS — incompatible RE attrs must not restore.
  const elecRestored = normalizeMarketplaceFilters({
    ...DEFAULT_MARKETPLACE_FILTERS,
    ...parseMarketplaceFiltersFromUrl(reUrl, "electronics"),
    category: "electronics",
  });
  assert.equal(elecRestored.categoryAttributes?.rooms, undefined, "rooms dropped");
  assert.equal(
    elecRestored.categoryAttributes?.propertyType,
    undefined,
    "propertyType dropped"
  );
  // Price/condition agnostics survive if present.
  const withPrice = normalizeMarketplaceFilters({
    ...re,
    category: "real_estate",
    priceMax: 120000,
  });
  const urlWithPrice = serializeMarketplaceFiltersIntoUrl(withPrice, new URLSearchParams());
  const jobsRestored = normalizeMarketplaceFilters({
    ...DEFAULT_MARKETPLACE_FILTERS,
    ...parseMarketplaceFiltersFromUrl(urlWithPrice, "jobs"),
    category: "jobs",
  });
  assert.equal(jobsRestored.priceMax, 120000, "agnostic price persists across vertical");
});

test("18.3-I: syncMarketplaceFiltersToUrl is a guarded replaceState (no-op on identity)", () => {
  // Without a browser, the sync must be a safe no-op (never throws).
  assert.doesNotThrow(() => syncMarketplaceFiltersToUrl(DEFAULT_MARKETPLACE_FILTERS));
});

test("18.3 regression: syncMarketplaceFiltersToUrl carries serialized params into the URL", () => {
  // Regression guard for the sync bug where serializeMarketplaceFiltersIntoUrl's
  // returned (augmented) URLSearchParams was discarded, leaving the URL empty.
  const state = normalizeMarketplaceFilters({
    category: "real_estate",
    location: "Vilnius",
    priceMax: 90000,
    categoryAttributes: { propertyType: "Butas", rooms: "2" },
    facetQueryString: "vertical=real_estate",
  });
  let writtenParams: string | null = null;
  const historyState = {} as unknown;
  (globalThis as { window?: unknown }).window = {
    location: {
      pathname: "/search",
      search: "",
      hash: "",
    },
    history: {
      state: historyState,
      replaceState(_state: unknown, _title: string, url: string) {
        writtenParams = String(url);
      },
    },
  } as unknown as Window & typeof globalThis;
  try {
    syncMarketplaceFiltersToUrl(state);
    assert.ok(writtenParams, "replaceState was called with a URL");
    assert.match(
      writtenParams!,
      /^\/search\?vertical=real_estate&location=Vilnius&price_max=90000&ca_propertyType=Butas&ca_rooms=2$/,
      "URL merges 13B facetQueryString with complementary frontend facets"
    );
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test("18.3-E: coerceCategoryAttributesToCategory drops incompatible attrs on switch", () => {
  const re = normalizeMarketplaceFilters({
    category: "real_estate",
    location: "Vilnius",
    priceMax: 120000,
    categoryAttributes: { rooms: "2", propertyType: "Butas", furnishing: "Įrengtas" },
  });

  // REAL_ESTATE → ELECTRONICS: rooms/propertyType are RE-only and must go.
  const elec = coerceCategoryAttributesToCategory(re, "electronics");
  assert.equal(elec.category, "electronics", "category switched");
  assert.equal(elec.categoryAttributes?.rooms, undefined, "rooms dropped");
  assert.equal(elec.categoryAttributes?.propertyType, undefined, "propertyType dropped");
  // location + price are vertical-agnostic and preserved.
  assert.equal(elec.location, "Vilnius", "agnostic location preserved");
  assert.equal(elec.priceMax, 120000, "agnostic price preserved");

  // ELECTRONICS → SERVICES → JOBS → TRANSPORT also converge (only agnostics remain).
  for (const cat of ["services", "jobs", "vehicles"] as const) {
    const next = coerceCategoryAttributesToCategory(elec, cat);
    assert.equal(next.category, cat, `switched to ${cat}`);
    assert.deepEqual(next.categoryAttributes ?? {}, {}, `no leftovers for ${cat}`);
    assert.equal(next.location, "Vilnius", `location kept for ${cat}`);
  }
});

test("18.3-A: applyMarketplaceFilters respects the restored URL state", () => {
  const restored = appliedUrlRoundTrip(
    "2 kambarių butas Vilniuje iki 120000 €"
  ).restored;

  const target = makeListing({
    id: "flat",
    title: "Butas Vilniuje",
    price: 110000,
    location: "Vilnius",
    category: "real_estate",
    attributes: { propertyType: "Butas", rooms: "2" },
  });
  const wrongCity = makeListing({
    id: "flat-kns",
    title: "Butas Kaune",
    price: 60000,
    location: "Kaunas",
    category: "real_estate",
    attributes: { propertyType: "Butas", rooms: "2" },
  });
  const wrongRooms = makeListing({
    id: "flat-3r",
    title: "Butas Vilniuje",
    price: 80000,
    location: "Vilnius",
    category: "real_estate",
    attributes: { propertyType: "Butas", rooms: "3" },
  });

  const results = applyMarketplaceFilters([target, wrongCity, wrongRooms], restored, null);
  const ids = results.map((r) => r.id);
  assert.ok(ids.includes("flat"), "intended result survives restored state");
  assert.ok(!ids.includes("flat-kns"), "cross-location decoy removed");
  assert.ok(!ids.includes("flat-3r"), "wrong-rooms decoy removed");
});

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 18.3.1 — STALE COMPLEMENTARY URL FACET REMOVAL
//
// The complementary serializer must be state-authoritative (replacement-safe),
// not append-only: clearing a facet to its default state deterministically removes
// it from the URL, so reload / deep-link cannot resurrect a stale filter. Only
// the frontend complement keys are stripped; 13B canonical params survive.
// ─────────────────────────────────────────────────────────────────────────────

/** State with a full active complement, ready to be cleared facet-by-facet. */
function activeReState(overrides: Partial<MarketplaceFilterState> = {}): MarketplaceFilterState {
  return normalizeMarketplaceFilters({
    category: "real_estate",
    location: "Vilnius",
    priceMin: 0,
    priceMax: 120000,
    condition: "used",
    radiusKm: 20,
    sort: "newest",
    categoryAttributes: { rooms: "2", propertyType: "Butas" },
    facetQueryString: "vertical=real_estate&q=butas",
    ...overrides,
  });
}

function serialize(state: MarketplaceFilterState, base: string): URLSearchParams {
  return serializeMarketplaceFiltersIntoUrl(
    state,
    new URLSearchParams(base)
  );
}

test("18.3.1: priceMax=null → price_max disappears from URL (stale removed)", () => {
  // Prior URL already carries price_max=120000 from an earlier state.
  const cleared = activeReState({ priceMax: null });
  const params = serialize(cleared, "vertical=real_estate&q=butas&price_max=120000&location=Vilnius");
  assert.equal(params.get("price_max"), null, "stale price_max removed");
  assert.equal(params.get("price_min"), "0", "active price_min stays");
  // 13B canonical survives.
  assert.equal(params.get("vertical"), "real_estate");
  assert.equal(params.get("q"), "butas");
  // Reload restores nothing for price.
  const restored = parseMarketplaceFiltersFromUrl(params, cleared.category);
  assert.equal(restored.priceMax, undefined, "price not resurrected on reload");
});

test("18.3.1: location='' → location param disappears from URL", () => {
  const cleared = activeReState({ location: "" });
  const params = serialize(cleared, "vertical=real_estate&q=butas&location=Vilnius&price_max=120000");
  assert.equal(params.get("location"), null, "stale location removed");
  assert.equal(params.get("vertical"), "real_estate", "13B vertical intact");
  assert.equal(params.get("q"), "butas", "13B q intact");
  const restored = parseMarketplaceFiltersFromUrl(params, cleared.category);
  assert.equal(restored.location, undefined, "location not resurrected");
});

test("18.3.1: condition=all → condition param disappears from URL", () => {
  const cleared = activeReState({ condition: "all" });
  const params = serialize(cleared, "vertical=real_estate&location=Vilnius&condition=used&ca_rooms=2");
  assert.equal(params.get("condition"), null, "stale condition removed");
  assert.equal(params.get("location"), "Vilnius", "active location kept");
});

test("18.3.1: radius=null → radius param disappears from URL", () => {
  const cleared = activeReState({ radiusKm: null });
  const params = serialize(cleared, "vertical=real_estate&location=Vilnius&radius=20");
  assert.equal(params.get("radius"), null, "stale radius removed");
  assert.equal(params.get("location"), "Vilnius", "active location kept");
});

test("18.3.1: sort default (relevance) → stale sort param disappears from URL (shared key)", () => {
  // `sort` is a shared 13B/complement key; when state has no sort preference the
  // URL must not keep an old sort value.
  const cleared = activeReState({ sort: "relevance" });
  const params = serialize(cleared, "vertical=real_estate&q=butas&sort=newest");
  assert.equal(params.get("sort"), null, "stale sort removed");
  assert.equal(params.get("vertical"), "real_estate", "13B vertical intact");
});

test("18.3.1: rooms chip removed → ca_rooms disappears from URL and reload does not restore", () => {
  // Remove the rooms facet; the category attr is gone from state.
  const cleared = activeReState({ categoryAttributes: { propertyType: "Butas" } });
  const params = serialize(
    cleared,
    "vertical=real_estate&location=Vilnius&ca_rooms=2&ca_propertyType=Butas"
  );
  assert.equal(params.get("ca_rooms"), null, "stale ca_rooms removed");
  assert.equal(params.get("ca_propertyType"), "Butas", "active ca_propertyType kept");
  // Reload: parseMarketplaceFiltersFromUrl must not resurrect rooms.
  const restored = parseMarketplaceFiltersFromUrl(params, cleared.category);
  assert.equal(restored.categoryAttributes?.rooms, undefined, "rooms not resurrected");
  assert.equal(restored.categoryAttributes?.propertyType, "Butas");
});

test("18.3.1: clearing the whole complement leaves ONLY active (and 13B) params", () => {
  const cleared = normalizeMarketplaceFilters({
    category: "real_estate",
    facetQueryString: "vertical=real_estate&q=butas&predicate_x=5",
  });
  const params = serialize(
    cleared,
    "vertical=real_estate&q=butas&predicate_x=5&location=Vilnius&price_max=120000&condition=used&radius=20&sort=newest&ca_rooms=2&ca_propertyType=Butas"
  );
  // Every stale complementary facet is gone.
  for (const key of ["location", "price_min", "price_max", "condition", "radius", "sort", "ca_rooms", "ca_propertyType"]) {
    assert.equal(params.get(key), null, `stale ${key} removed`);
  }
  // 13B canonical params (vertical, q, and the predicate) are untouched.
  assert.equal(params.get("vertical"), "real_estate", "13B vertical intact");
  assert.equal(params.get("q"), "butas", "13B q intact");
  assert.equal(params.get("predicate_x"), "5", "13B predicate intact");
});

test("18.3.1: active complement is re-written after strip (round-trip intact)", () => {
  const params = serialize(activeReState(), "vertical=real_estate&q=butas&location=Kaunas&price_max=90000&ca_rooms=3");
  assert.equal(params.get("location"), "Vilnius", "state wins over stale location");
  assert.equal(params.get("price_max"), "120000", "state wins over stale price_max");
  assert.equal(params.get("ca_rooms"), "2", "state wins over stale ca_rooms");
  assert.equal(params.get("ca_propertyType"), "Butas");
  assert.equal(params.get("vertical"), "real_estate", "13B vertical intact");
  assert.equal(params.get("q"), "butas", "13B q intact");
});

test("18.3.1: genuine 13B predicate keys are never stripped (condition/location owned by 13B)", () => {
  // 13B canonical `condition` uses option values (Naudotas) — NOT the frontend
  // complement's `new`/`used`. When condition is a current 13B predicate, the
  // strip must preserve it (regression guard against clobbering canonical state).
  const noComplement = normalizeMarketplaceFilters({
    category: "electronics",
    facetQueryString: "vertical=electronics&condition=Naudotas",
  });
  const params = serialize(
    noComplement,
    "vertical=electronics&condition=Naudotas&price_max=500"
  );
  assert.equal(params.get("condition"), "Naudotas", "13B-owned condition preserved");
  assert.equal(params.get("price_max"), null, "complementary price_max still stripped");
  assert.equal(params.get("vertical"), "electronics", "13B vertical intact");

  // Genuine 13B `location` + range predicates (RE/JOBS canonical attributes).
  // In production the complement mirror keeps `filters.location` in sync with the
  // URL `location` predicate (commit + hydrate), so it is preserved verbatim.
  const reNoComplement = normalizeMarketplaceFilters({
    category: "real_estate",
    location: "Vilnius",
    facetQueryString: "vertical=real_estate&location=Vilnius&rooms_min=2",
  });
  const reParams = serialize(
    reNoComplement,
    "vertical=real_estate&location=Vilnius&rooms_min=2&ca_rooms=2"
  );
  assert.equal(reParams.get("location"), "Vilnius", "13B-owned location predicate preserved");
  assert.equal(reParams.get("rooms_min"), "2", "13B range predicate preserved");
  assert.equal(reParams.get("ca_rooms"), null, "stale complement ca_rooms removed (state has no rooms)");
  assert.equal(reParams.get("vertical"), "real_estate", "13B vertical intact");
});

test("18.3.1: stale complement location is stripped when NOT a current 13B predicate", () => {
  // A leftover `location` from the complementary layer (no longer in the current
  // canonical facetQueryString) must be removed — the blocker's core scenario.
  const cleared = activeReState({ location: "" });
  const params = serialize(
    cleared,
    "vertical=real_estate&q=butas&location=Tel%C5%A1iai"
  );
  assert.equal(params.get("location"), null, "stale complement location removed");
  assert.equal(params.get("vertical"), "real_estate", "13B vertical intact");
  assert.equal(params.get("q"), "butas", "13B q intact");
});

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 18.3.2 — CANONICAL SHARED-FACET CLEAR CLOSURE
//
// `commit()` must derive a single `location` / `sort` mirror BEFORE writing the
// URL, and feed the SAME derived state into `serializeMarketplaceFiltersIntoUrl`
// and `setMarketplaceFilters`. A canonical clear is state-authoritative and
// reload-safe; a complement-only facet is preserved.
// ─────────────────────────────────────────────────────────────────────────────

test("18.3.2-A: canonical location clear is state-authoritative (no stale fallback)", () => {
  // (1) Set a canonical location → the mirror takes the predicate value.
  let derived = deriveCanonicalLocationMirror(
    "vertical=real_estate", // prev query had no location
    "Kaunas", // stale complement location
    "Vilnius" // next canonical predicate
  );
  assert.equal(derived, "Vilnius", "canonical location predicate wins while present");

  // (2) Clear the canonical location: the predicate is gone AND the previous
  // canonical query HAD a location → mirror MUST be cleared, NOT fall back to
  // the stale "Kaunas".
  derived = deriveCanonicalLocationMirror(
    "vertical=real_estate&location=Vilnius", // prev canonical had location
    "Vilnius", // stale complement mirror
    undefined // next has no canonical predicate (cleared)
  );
  assert.equal(derived, "", "removed canonical location deterministically clears");

  // Reload-safe: a cleared location must not reappear in the URL.
  const clearedState = normalizeMarketplaceFilters({
    category: "real_estate",
    location: "",
    facetQueryString: "vertical=real_estate",
  });
  const params = serialize(
    clearedState,
    "vertical=real_estate&location=Vilnius&rooms_min=2"
  );
  assert.equal(params.get("location"), null, "location gone from URL after clear");
  assert.equal(params.get("rooms_min"), "2", "unrelated 13B predicate kept");
  const restored = parseMarketplaceFiltersFromUrl(params, "real_estate");
  assert.equal(restored.location, undefined, "location not resurrected on reload");
});

test("18.3.2-A2: canonicalLocationPredicate reads a genuine 13B location predicate", () => {
  assert.equal(
    canonicalLocationPredicate("vertical=real_estate&location=Vilnius&rooms_min=2"),
    "Vilnius",
    "canonical location predicate detected verbatim"
  );
  assert.equal(
    canonicalLocationPredicate("vertical=real_estate&location=Vilnius&price_max=90000"),
    "Vilnius",
    "complement-only keys do not poison the read"
  );
  assert.equal(
    canonicalLocationPredicate("vertical=real_estate&rooms_min=2"),
    undefined,
    "no canonical location predicate => undefined"
  );
  assert.equal(canonicalLocationPredicate(""), undefined, "empty query => undefined");
});

test("18.3.2-B: canonical sort clear is derived before serialization (reload-safe)", () => {
  // Non-default canonical sorts map to the complement mirror.
  assert.equal(deriveCanonicalSortMirror("newest"), "newest");
  assert.equal(deriveCanonicalSortMirror("price_asc"), "cheapest");
  // Clearing to relevance yields the default mirror.
  assert.equal(deriveCanonicalSortMirror("relevance"), "relevance");

  // Full production path: set non-default sort in state+URL, then clear.
  const sorted = normalizeMarketplaceFilters({
    category: "real_estate",
    sort: "newest",
    facetQueryString: "vertical=real_estate&sort=newest",
  });
  const setParams = serialize(sorted, "vertical=real_estate&sort=newest");
  assert.equal(setParams.get("sort"), "newest", "non-default sort written to URL");

  const cleared = normalizeMarketplaceFilters({
    ...sorted,
    sort: "relevance",
  });
  const clearParams = serialize(cleared, "vertical=real_estate&sort=newest");
  assert.equal(clearParams.get("sort"), null, "cleared sort removed from URL");
  const restored = parseMarketplaceFiltersFromUrl(clearParams, "real_estate");
  assert.equal(restored.sort ?? "relevance", "relevance", "reload keeps default relevance");
});

test("18.3.2-C: legitimate complement-only location is preserved (not blindly cleared)", () => {
  // A location authored via AI chips / classic FilterFields lives only in
  // `filters.location`; the canonical query never held a location predicate.
  // A subsequent canonical commit (e.g. a sort change) must NOT wipe it.
  const derived = deriveCanonicalLocationMirror(
    "vertical=real_estate", // prev canonical query has NO location predicate
    "Vilnius", // complement-only active location
    undefined // next canonical has no location predicate (only sort changed)
  );
  assert.equal(derived, "Vilnius", "complement-only location preserved");

  // Serializer agrees: the active location field keeps `location` in the URL.
  const preserved = normalizeMarketplaceFilters({
    category: "real_estate",
    location: "Vilnius",
    sort: "newest",
    facetQueryString: "vertical=real_estate&sort=newest",
  });
  const params = serialize(preserved, "vertical=real_estate&sort=newest");
  assert.equal(params.get("location"), "Vilnius", "complement location re-written");
  assert.equal(params.get("sort"), "newest", "canonical sort still present");
});

test("18.3.2-D: derived mirror feeds both serializer and committed state (no one-write-lag)", () => {
  // REPLICATES the exact `commit()` flow: derive sort+location ONCE, serialize
  // the URL with the same derived state, then commit the same derived state.
  const prev = normalizeMarketplaceFilters({
    category: "real_estate",
    location: "Vilnius", // canonical location currently set
    sort: "newest",
    facetQueryString: "vertical=real_estate&sort=newest&location=Vilnius",
  });
  const nextSort = "relevance"; // canonical sort cleared
  const nextLocation = undefined; // canonical location cleared

  const derivedSort = deriveCanonicalSortMirror(nextSort);
  const derivedLocation = deriveCanonicalLocationMirror(
    prev.facetQueryString,
    prev.location,
    nextLocation
  );
  const derivedState = { ...prev, sort: derivedSort, location: derivedLocation };

  const params = serialize(derivedState, "vertical=real_estate&sort=newest&location=Vilnius");
  // The URL reflects the DERIVED (cleared) state on this same write:
  assert.equal(params.get("sort"), null, "sort cleared in URL immediately");
  assert.equal(params.get("location"), null, "location cleared in URL immediately");
  assert.equal(params.get("vertical"), "real_estate", "canonical vertical survives");
  // The committed state matches the serialized URL (no one-write-lag):
  assert.equal(derivedState.sort, "relevance");
  assert.equal(derivedState.location, "");
});
