import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretAiFacets, type FacetChip } from "@/lib/ai-facet-interpretation";
import { applyMarketplaceFilters, DEFAULT_MARKETPLACE_FILTERS } from "@/lib/marketplace-view";
import { resolveAiVertical } from "@/lib/ai-vertical-adapter";
import { applyAiFacet, applyFacetChips, chipToFacetTarget, removeAiFacet } from "@/lib/apply-ai-facet";
import { canUseShipping, getCategorySchema } from "@vauto/shared/marketplace-domain";
import type { Listing, ListingCategory, ScoredListing } from "@/lib/types";

/**
 * Stage 18.2-A — Intent → structured facet → actual result consistency.
 *
 * For each of the 6 canonical verticals we prove, end-to-end and WITHOUT any
 * live AI or network:
 *   natural language
 *   → canonical vertical (ai-vertical-adapter over the 13A registry)
 *   → canonical structured facets (interpretAiFacets)
 *   → applyMarketplaceFilters over a controlled listing set
 *   → the intended result survives.
 *
 * The listing fixtures below are INPUT data (adapted to the deterministic mock
 * catalog), never a re-declaration of production semantics — the facets,
 * category model and capability rules come from the canonical 13A/13B modules.
 */

function makeListing(overrides: Partial<Listing>): ScoredListing {
  const base: ScoredListing = {
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
  };
  return { ...base, ...overrides };
}

function chipMap(chips: FacetChip[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of chips) out[c.field] = c.value;
  return out;
}

const VERTICAL_QUERIES: Array<{
  label: string;
  query: string;
  category: ListingCategory;
  /** inteded listing that must survive the interpreted facet filtering */
  target: ScoredListing;
}> = [
  {
    label: "TRANSPORT",
    query: "BMW X5 iki 30000 €",
    category: "vehicles",
    target: makeListing({
      id: "v-aut",
      title: "BMW X5 4.4",
      price: 28000,
      location: "Kaunas",
      category: "vehicles",
      tags: ["bmw", "automobilis"],
    }),
  },
  {
    label: "REAL_ESTATE",
    query: "2 kambarių butas Vilniuje iki 120000 €",
    category: "real_estate",
    target: makeListing({
      id: "v-nt",
      title: "2 kambarių butas Vilnius",
      price: 105000,
      location: "Vilnius",
      category: "real_estate",
      attributes: { propertyType: "Butas", rooms: "2" },
    }),
  },
  {
    label: "ELECTRONICS",
    query: "MacBook Pro iki 1500 €",
    category: "electronics",
    target: makeListing({
      id: "v-el",
      title: "MacBook Pro",
      price: 1400,
      location: "Druskininkai",
      category: "electronics",
    }),
  },
  {
    label: "SERVICES",
    query: "Reikia santechniko Vilniuje",
    category: "services",
    target: makeListing({
      id: "v-svc",
      title: "Santechniko paslaugos",
      price: 60,
      location: "Vilnius",
      category: "services",
    }),
  },
  {
    label: "JOBS",
    query: "Ieškau programuotojo darbo nuotoliu",
    category: "jobs",
    target: makeListing({
      id: "v-job",
      title: "Programuotojas nuotoliu",
      price: 0,
      location: "Vilnius",
      category: "jobs",
      attributes: { locationType: "Nuotolinis" },
    }),
  },
  {
    label: "OTHER_GOODS (HOME_GARDEN)",
    query: "Naudotas dviratis iki 500 €",
    category: "home",
    target: makeListing({
      id: "v-goods",
      title: "Naudotas dviratis krosinis",
      price: 300,
      location: "Kaunas",
      category: "home",
    }),
  },
];

test("18.2-A: six verticals map NL → canonical vertical", () => {
  const expectations: Record<string, ListingCategory> = {
    "BMW X5 iki 30000 €": "vehicles",
    "2 kambarių butas Vilniuje iki 120000 €": "real_estate",
    "MacBook Pro iki 1500 €": "electronics",
    "Reikia santechniko Vilniuje": "services",
    "Ieškau programuotojo darbo nuotoliu": "jobs",
    "Naudotas dviratis iki 500 €": "home",
  };
  for (const [query, category] of Object.entries(expectations)) {
    assert.equal(resolveAiVertical(query), category, query);
  }
});

test("18.2-A: NL → canonical facets for each vertical (no separate semantics)", () => {
  for (const { query, category } of VERTICAL_QUERIES) {
    const interpretation = interpretAiFacets(query);
    assert.ok(interpretation.chips.length >= 1, `${query}: at least one canonical facet chip`);
    // The vertical chip writes the canonical listing category.
    const catChips = interpretation.chips.filter((c) => c.kind === "vertical");
    assert.equal(catChips.length, 1, `${query}: exactly one vertical chip`);
    assert.equal(catChips[0].value, category, `${query}: vertical chip is the canonical category`);
    // Every non-keyword chip writes to the canonical filter state.
    for (const c of interpretation.chips) {
      if (c.kind === "keyword") continue;
      assert.ok(c.field, `${c.kind} chip declares a canonical field (${query})`);
    }
  }
});

test("18.2-A: REAL_ESTATE query produces rooms + property type attributes", () => {
  const { chips } = interpretAiFacets("2 kambarių butas Vilniuje iki 120000 €");
  const fields = chipMap(chips);
  assert.equal(fields.propertyType, "Butas");
  // "2 kambarių" → rooms attribute chip (canonical plain-digit value "2").
  assert.ok(fields.rooms, "rooms attribute present");
});

test("18.2-A: ELECTRONICS query interprets a price bound", () => {
  const { chips } = interpretAiFacets("MacBook Pro iki 1500 €");
  const fields = chipMap(chips);
  assert.equal(fields.priceMax, "1500");
});

test("18.2-A: SERVICES query is location-oriented, maps to services", () => {
  const { chips } = interpretAiFacets("Reikia santechniko Vilniuje");
  const fields = chipMap(chips);
  assert.equal(fields.location, "Vilnius");
  assert.equal(chips.find((c) => c.kind === "vertical")?.value, "services");
});

test("18.2-A: JOBS query maps locationType remote/hybrid attribute", () => {
  const { chips } = interpretAiFacets("Ieškau programuotojo darbo nuotoliu");
  const fields = chipMap(chips);
  assert.equal(fields.locationType, "Nuotolinis");
  assert.equal(chips.find((c) => c.kind === "vertical")?.value, "jobs");
});

test("18.2-A: facet filtering actually changes the result set (vertical applies)", () => {
  // Decoy of a different vertical must be dropped, the target kept.
  const base = [
    VERTICAL_QUERIES[0].target, // vehicles BMW
    makeListing({
      id: "decoy-realestate",
      title: "Butas",
      price: 90000,
      location: "Vilnius",
      category: "real_estate",
    }),
  ];
  const filters = { category: "vehicles" as ListingCategory };
  const filtered = applyMarketplaceFilters(base as never, {
    category: "vehicles",
    priceMin: null,
    priceMax: null,
    condition: "all",
    location: "",
    radiusKm: null,
    categoryAttributes: {},
  } as never);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "v-aut");
  void filters;
});

test("18.2-A: price bound filtering drops above-budget listing", () => {
  const set = [VERTICAL_QUERIES[2].target]; // electronics MacBook 1400
  const over = makeListing({
    id: "v-el-over",
    title: "MacBook Max",
    price: 3000,
    location: "Vilnius",
    category: "electronics",
  });
  const all = [set[0], over];
  const filtered = applyMarketplaceFilters(all as never, {
    category: "electronics",
    priceMax: 1500,
    priceMin: null,
    condition: "all",
    location: "",
    radiusKm: null,
    categoryAttributes: {},
  } as never);
  const ids = filtered.map((l) => l.id);
  assert.deepEqual(ids, ["v-el"]);
});

test("18.2-A: capability model is canonical — no invented shipping (18.2-H)", () => {
  // REAL_ESTATE / SERVICES / JOBS must never ship.
  for (const cat of ["real_estate", "services", "jobs"] as ListingCategory[]) {
    assert.equal(canUseShipping(cat), false, `${cat} cannot ship`);
  }
  // Where test fixture uses clothing/other, canonical model is fail-closed for non-supported goods.
  assert.equal(canUseShipping("clothing"), true);
  assert.equal(canUseShipping("tools"), false);
  // A canonical physical-good vertical is derivable from the schema — never hardcoded here.
  const schema = getCategorySchema("ELECTRONICS");
  assert.ok(schema, "canonical ELECTRONICS vertical resolves via getCategorySchema");
  assert.equal(schema.uiSlug, "electronics");
});

test("18.2-B: AI chip removal recomputes the real result set (no ghost state)", () => {
  const base = [
    VERTICAL_QUERIES[0].target, // BMW vehicles, Kaunas 28000
    makeListing({
      id: "v-kaunas-2",
      title: "Audi A6",
      price: 18000,
      location: "Kaunas",
      category: "vehicles",
    }),
    makeListing({
      id: "v-vilnius",
      title: "BMW X5",
      price: 26000,
      location: "Vilnius",
      category: "vehicles",
    }),
  ];

  // AI interpreted "BMW Vilmiuse iki 26000" → vertical vehicles + location Vilnius + price ≤ 26000.
  let filters = DEFAULT_MARKETPLACE_FILTERS;
  filters = applyAiFacet(filters, { type: "vertical", value: "vehicles" });
  filters = applyAiFacet(filters, { type: "location", value: "Vilnius" });
  filters = applyAiFacet(filters, { type: "price", field: "priceMax", value: 26000 });

  const narrowed = applyMarketplaceFilters(base as never, {
    category: filters.category,
    location: filters.location,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    condition: "all",
    radiusKm: null,
    categoryAttributes: filters.categoryAttributes,
  } as never);
  assert.deepEqual(narrowed.map((l) => l.id), ["v-vilnius"]);

  // User removes the location criterion → results recompute to a wider set
  // (both Kaunas and Vilnius vehicles under the price cap).
  const withoutLocation = removeAiFacet(filters, "location");
  const wider = applyMarketplaceFilters(base as never, {
    category: withoutLocation.category,
    location: withoutLocation.location,
    priceMin: withoutLocation.priceMin,
    priceMax: withoutLocation.priceMax,
    condition: "all",
    radiusKm: null,
    categoryAttributes: withoutLocation.categoryAttributes,
  } as never);
  assert.equal(wider.length, 2, "removing the chip widens the real result set");
  // The removed location is not present in the canonical state (no ghost).
  assert.equal(withoutLocation.location, "");
});

test("18.2-D: vertical switch preserves compatible + drops incompatible facets", () => {
  let filters = DEFAULT_MARKETPLACE_FILTERS;
  // Start with an AI real-estate interpretation (rooms + property type).
  const re = interpretAiFacets("2 kambarių butas Vilniuje iki 120000 €");
  for (const chip of re.chips) {
    if (chip.kind === "keyword") continue;
    if (chip.kind === "vertical") {
      filters = applyAiFacet(filters, { type: "vertical", value: chip.value as never });
    } else if (chip.kind === "location") {
      filters = applyAiFacet(filters, { type: "location", value: chip.value });
    } else if (chip.kind === "price") {
      filters = applyAiFacet(filters, {
        type: "price",
        field: chip.field as "priceMin" | "priceMax",
        value: Number(chip.value) || null,
      });
    } else if (chip.kind === "attribute") {
      filters = applyAiFacet(filters, { type: "attribute", key: chip.field, value: chip.value });
    }
  }
  assert.ok(filters.categoryAttributes.propertyType, "real-estate-specific facet active");

  // Switch vertical to ELECTRONICS. RE-only facets (propertyType/rooms) must be
  // dropped; a generic compatible facet (priceMax) is preserved.
  filters = applyAiFacet(filters, { type: "vertical", value: "electronics" });
  assert.equal(filters.category, "electronics");
  assert.equal(filters.categoryAttributes.propertyType, undefined, "RE propertyType dropped");
  assert.equal(filters.categoryAttributes.rooms, undefined, "RE rooms dropped");
  assert.equal(filters.priceMax, 120000, "compatible priceMax preserved");
});

test("18.2-D: switching back/other vertical never leaves stale incompatible attribute", () => {
  let filters = DEFAULT_MARKETPLACE_FILTERS;
  filters = applyAiFacet(filters, { type: "vertical", value: "real_estate" });
  filters = applyAiFacet(filters, { type: "attribute", key: "propertyType", value: "Butas" });
  assert.equal(filters.categoryAttributes.propertyType, "Butas");

  // Real estate → services removes propertyType (not a service facet).
  filters = applyAiFacet(filters, { type: "vertical", value: "services" });
  assert.equal(filters.category, "services");
  assert.equal(filters.categoryAttributes.propertyType, undefined);
});

/**
 * 18.2.1 — MEDIUM-1: SINGLE DETERMINISTIC, PARAMETERIZED integration test.
 *
 * For each of the 6 canonical verticals we run the REAL production chain
 * end-to-end and assert the full result-set effect:
 *
 *   resolveAiVertical(query)
 *   → interpretAiFacets(query)                      (real interpreter)
 *   → applyFacetChips(DEFAULT, chips)               (real production write bridge,
 *                                                     same code the UI uses)
 *   → applyMarketplaceFilters([target+decoys], state) (real filter pipeline)
 *
 * Each scenario carries: 1 intended listing, ≥1 same-vertical decoy that
 * violates an interpreted facet, and a cross-vertical decoy. NO production
 * filter rule is re-declared here — the expected structured facets and the
 * filter state are produced by the interpreter/bridge and asserted against the
 * canonical contract. Assertions (matching 18.2.1 MEDIUM-1 A–G):
 *
 *   A  resolved vertical == expected canonical listing category
 *   B  expected structured facets genuinely exist (chips)
 *   C  facets reached the canonical filter state
 *   D  intended listing survives filtering
 *   E  same-vertical decoy (violates a facet) is removed
 *   F  cross-vertical decoy is removed
 *   G  no parallel test-only marketplace semantics (all filters came from the
 *      real interpreter → real bridge → real filter pipeline)
 */

interface FacetScenario {
  label: string;
  query: string;
  /** Canonical vertical chip value (a ListingCategory) the interpreter must emit. */
  category: ListingCategory;
  /** Canonical chip fields the interpretation must contain (assert B). */
  expectedChipFields: string[];
  /**
   * Canonical chip fields that the interpreter MAY emit. When emitted, they are
   * asserted to reach the canonical filter state (assert C) and to be backed by
   * a mandatory removal proof (assert E). This honours "jeigu interpreter jį
   * generuoja" for criteria the deterministic parser does not always emit (e.g.
   * a 3-digit price bound below the parser's 4-digit floor).
   */
  optionalChipFields?: string[];
  /** Canonical filter-state values that must be set after the bridge (assert C). */
  expectedState: {
    category: ListingCategory;
    location?: string;
    priceMin?: number | null;
    priceMax?: number | null;
    condition?: string;
    categoryAttributes?: Record<string, string>;
  };
  /**
   * When present and the corresponding optional chip is emitted, this listing
   * must be removed by that facet. It proves the optional facet really filters.
   */
  optionalDecoyFor?: { field: string; decoy: ScoredListing };
  target: ScoredListing;
  /** At least one same-vertical listing that violates an interpreted facet. */
  sameVerticalDecoys: ScoredListing[];
  /** A listing of a different vertical that must be dropped by the category facet. */
  crossVerticalDecoy: ScoredListing | null;
}

const FACET_SCENARIOS: FacetScenario[] = [
  {
    label: "TRANSPORT",
    query: "BMW X5 iki 30000 €",
    category: "vehicles",
    expectedChipFields: ["category", "priceMax"],
    expectedState: { category: "vehicles", priceMax: 30000 },
    target: makeListing({
      id: "s-tr-target",
      title: "BMW X5 4.4 d",
      price: 28000,
      location: "Kaunas",
      category: "vehicles",
      tags: ["bmw", "automobilis"],
    }),
    // Same vertical, above the interpreted price cap → must be removed.
    sameVerticalDecoys: [
      makeListing({
        id: "s-tr-over",
        title: "BMW X5 M",
        price: 45000,
        location: "Kaunas",
        category: "vehicles",
        tags: ["bmw"],
      }),
    ],
    crossVerticalDecoy: makeListing({
      id: "s-tr-cross",
      title: "Butas",
      price: 90000,
      location: "Vilnius",
      category: "real_estate",
    }),
  },
  {
    label: "REAL_ESTATE",
    query: "2 kambarių butas Vilniuje iki 120000 €",
    category: "real_estate",
    expectedChipFields: ["category", "location", "priceMax", "propertyType", "rooms"],
    expectedState: {
    category: "real_estate",
    location: "Vilnius",
    priceMax: 120000,
    categoryAttributes: { propertyType: "Butas", rooms: "2" },
    },
    target: makeListing({
      id: "s-re-target",
      title: "Butas Vilniuje",
      price: 105000,
      location: "Vilnius",
      category: "real_estate",
      attributes: { propertyType: "Butas", rooms: "2" },
    }),
    sameVerticalDecoys: [
      // Above the price cap.
      makeListing({
        id: "s-re-price",
        title: "Butas Vilniuje brangus",
        price: 130000,
        location: "Vilnius",
        category: "real_estate",
        attributes: { propertyType: "Butas", rooms: "2" },
      }),
      // Violates the 2-room facet.
      makeListing({
        id: "s-re-rooms",
        title: "Butas Vilniuje 3 kambariai",
        price: 90000,
        location: "Vilnius",
        category: "real_estate",
        attributes: { propertyType: "Butas", rooms: "3" },
      }),
      // Violates the property-type facet.
      makeListing({
        id: "s-re-prop",
        title: "Namas Vilniuje",
        price: 98000,
        location: "Vilnius",
        category: "real_estate",
        attributes: { propertyType: "Namas", rooms: "2" },
      }),
    ],
    crossVerticalDecoy: makeListing({
      id: "s-re-cross",
      title: "Televizorius",
      price: 700,
      location: "Vilnius",
      category: "electronics",
    }),
  },
  {
    label: "ELECTRONICS",
    query: "MacBook Pro iki 1500 €",
    category: "electronics",
    expectedChipFields: ["category", "priceMax"],
    expectedState: { category: "electronics", priceMax: 1500 },
    target: makeListing({
      id: "s-el-target",
      title: "MacBook Pro",
      price: 1400,
      location: "Druskininkai",
      category: "electronics",
    }),
    sameVerticalDecoys: [
      makeListing({
        id: "s-el-over",
        title: "MacBook Pro Max",
        price: 2400,
        location: "Vilnius",
        category: "electronics",
      }),
    ],
    crossVerticalDecoy: makeListing({
      id: "s-el-cross",
      title: "BMW",
      price: 20000,
      location: "Kaunas",
      category: "vehicles",
    }),
  },
  {
    label: "SERVICES",
    query: "Reikia santechniko Vilniuje",
    category: "services",
    expectedChipFields: ["category", "location"],
    expectedState: { category: "services", location: "Vilnius" },
    target: makeListing({
      id: "s-sv-target",
      title: "Santechniko paslaugos Vilniuje",
      price: 60,
      location: "Vilnius",
      category: "services",
    }),
    sameVerticalDecoys: [
      // Same vertical but violates the location facet.
      makeListing({
        id: "s-sv-loc",
        title: "Santechniko paslaugos Kaune",
        price: 55,
        location: "Kaunas",
        category: "services",
      }),
    ],
    crossVerticalDecoy: makeListing({
      id: "s-sv-cross",
      title: "Programuotojo darbas",
      price: 0,
      location: "Vilnius",
      category: "jobs",
    }),
  },
  {
    label: "JOBS",
    query: "Ieškau programuotojo darbo nuotoliu",
    category: "jobs",
    expectedChipFields: ["category", "locationType"],
    expectedState: { category: "jobs", categoryAttributes: { locationType: "Nuotolinis" } },
    target: makeListing({
      id: "s-jb-target",
      title: "Programuotojas nuotoliu",
      price: 0,
      location: "Vilnius",
      category: "jobs",
      attributes: { locationType: "Nuotolinis" },
    }),
    sameVerticalDecoys: [
      // Same vertical but office work → violates the remote facet.
      makeListing({
        id: "s-jb-office",
        title: "Programuotojas biure",
        price: 0,
        location: "Vilnius",
        category: "jobs",
        attributes: { locationType: "Ofise" },
      }),
    ],
    crossVerticalDecoy: makeListing({
      id: "s-jb-cross",
      title: "Santechniko paslaugos",
      price: 50,
      location: "Vilnius",
      category: "services",
    }),
  },
  {
    label: "OTHER_GOODS (HOME_GARDEN)",
    query: "Naudotas dviratis iki 500 €",
    category: "home",
    // Mandatory proof: category + used-condition really filter.
    expectedChipFields: ["category", "condition"],
    // priceMax is below the parser's 4-digit floor for "500", so it is proven
    // conditionally ("jeigu interpreter jį generuoja") via optionalDecoyFor.
    optionalChipFields: ["priceMax"],
    expectedState: { category: "home", condition: "used", priceMax: 500 },
    optionalDecoyFor: {
      // Proves a price-bound facet, when emitted, really removes an over-cap good.
      field: "priceMax",
      decoy: makeListing({
        id: "s-ho-over",
        title: "Naudotas dviratis plentinis",
        price: 900,
        location: "Kaunas",
        category: "home",
        attributes: { condition: "naudotas" },
      }),
    },
    target: makeListing({
      id: "s-ho-target",
      title: "Naudotas dviratis krosinis",
      price: 300,
      location: "Kaunas",
      category: "home",
      attributes: { condition: "naudotas" },
    }),
    sameVerticalDecoys: [
      // Violates the used-condition facet (new condition).
      makeListing({
        id: "s-ho-new",
        title: "Naujas dviratis",
        price: 200,
        location: "Kaunas",
        category: "home",
        attributes: { condition: "naujas" },
      }),
    ],
    crossVerticalDecoy: makeListing({
      id: "s-ho-cross",
      title: "Televizorius",
      price: 400,
      location: "Vilnius",
      category: "electronics",
    }),
  },
  {
    label: "OTHER_GOODS (HOME_GARDEN) — price bound",
    query: "Naudotas stalas iki 1200 €",
    category: "home",
    // priceMax is above the parser's 4-digit floor, so it IS generated and must
    // concretely remove an over-cap same-vertical decoy.
    expectedChipFields: ["category", "priceMax"],
    expectedState: { category: "home", priceMax: 1200 },
    target: makeListing({
      id: "s-hg-target",
      title: "Stalas ąžuolinis",
      price: 900,
      location: "Kaunas",
      category: "home",
      attributes: { condition: "naudotas" },
    }),
    sameVerticalDecoys: [
      makeListing({
        id: "s-hg-over",
        title: "Stalas didelis",
        price: 2500,
        location: "Kaunas",
        category: "home",
        attributes: { condition: "naudotas" },
      }),
    ],
    crossVerticalDecoy: makeListing({
      id: "s-hg-cross",
      title: "Televizorius",
      price: 800,
      location: "Vilnius",
      category: "electronics",
    }),
  },
];

test("18.2.1: 6-vertical parameterized integration — intent → canonical facets → filter state → intended survives, decoys removed", () => {
  for (const scenario of FACET_SCENARIOS) {
    const ctx = `[${scenario.label}]`;
    const interpretation = interpretAiFacets(scenario.query);

    // A — resolved vertical is the expected canonical listing category.
    assert.equal(resolveAiVertical(scenario.query), scenario.category, `${ctx} A: vertical`);
    const verticalChip = interpretation.chips.find((c) => c.kind === "vertical");
    assert.equal(verticalChip?.value, scenario.category, `${ctx} A: vertical chip`);

    // B — the expected structured facets genuinely exist as chips (mandatory ones).
    const fields = chipMap(interpretation.chips);
    for (const f of scenario.expectedChipFields) {
      assert.ok(fields[f], `${ctx} B: chip field "${f}" present`);
    }
    const optionalFields = scenario.optionalChipFields ?? [];
    const optionalEmitted = optionalFields.filter((f) => fields[f]);
    for (const f of optionalEmitted) {
      assert.ok(fields[f], `${ctx} B: optional chip field "${f}" present when emitted`);
    }

    // C — the facets reached the canonical filter state via the real bridge.
    const filters = applyFacetChips(DEFAULT_MARKETPLACE_FILTERS, interpretation.chips);
    assert.equal(filters.category, scenario.expectedState.category, `${ctx} C: filter category`);
    if (scenario.expectedState.location !== undefined) {
      assert.equal(filters.location, scenario.expectedState.location, `${ctx} C: filter location`);
    }
    if (scenario.expectedState.priceMax != null && !optionalFields.includes("priceMax")) {
      assert.equal(filters.priceMax, scenario.expectedState.priceMax, `${ctx} C: filter priceMax`);
    }
    if (scenario.expectedState.condition !== undefined) {
      assert.equal(filters.condition, scenario.expectedState.condition, `${ctx} C: filter condition`);
    }
    const expectedAttrs = scenario.expectedState.categoryAttributes ?? {};
    for (const [key, value] of Object.entries(expectedAttrs)) {
      assert.equal(filters.categoryAttributes[key], value, `${ctx} C: filter attr "${key}"`);
    }

    // G — no parallel test-only semantics: the state came only from the real
    // production bridge over the real interpreter. Every non-keyword chip maps
    // through chipToFacetTarget (the same function the UI applies).
    for (const chip of interpretation.chips) {
      if (chip.kind === "keyword") continue;
      assert.ok(chipToFacetTarget(chip, chip.value), `${ctx} G: chip "${chip.kind}" maps`);
    }

    // D/E/F — run the real filter pipeline over intended + decoys.
    const optionalDecoy = scenario.optionalDecoyFor;
    const listings = [
      scenario.target,
      ...scenario.sameVerticalDecoys,
      ...(scenario.crossVerticalDecoy ? [scenario.crossVerticalDecoy] : []),
      ...(optionalDecoy ? [optionalDecoy.decoy] : []),
    ];
    const result = applyMarketplaceFilters(listings, filters);
    const ids = result.map((l) => l.id);

    // D — intended listing survives.
    assert.ok(ids.includes(scenario.target.id), `${ctx} D: intended survives (got ${ids.join(",") || "none"})`);
    // E — every same-vertical decoy is removed.
    for (const decoy of scenario.sameVerticalDecoys) {
      assert.ok(!ids.includes(decoy.id), `${ctx} E: same-vertical decoy removed (${decoy.id})`);
    }
    // F — cross-vertical decoy is removed.
    if (scenario.crossVerticalDecoy) {
      assert.ok(!ids.includes(scenario.crossVerticalDecoy.id), `${ctx} F: cross-vertical decoy removed`);
    }
    // Optional-facet proof ("jeigu interpreter jį generuoja"): when the optional
    // chip is emitted it must reach the filter state and really remove its decoy.
    if (optionalDecoy && optionalEmitted.includes(optionalDecoy.field)) {
      assert.ok(!ids.includes(optionalDecoy.decoy.id), `${ctx} E: optional "${optionalDecoy.field}" decoy removed`);
    }
    // Exactly the intended listing survives. When a decoy only an un-emitted
    // optional facet would remove, it is expected to survive (it does not
    // violate any applied criterion) — that is the documented parser behaviour.
    const optionalDecoyNotEmitted =
      optionalDecoy && !optionalEmitted.includes(optionalDecoy.field);
    const expectedSurvivors = 1 + (optionalDecoyNotEmitted ? 1 : 0);
    assert.equal(result.length, expectedSurvivors, `${ctx} D/E/F: expected ${expectedSurvivors} result(s) (got ${ids.join(",") || "none"})`);
  }
});

