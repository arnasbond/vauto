/**
 * FC-SEARCH — conversational search continuity root-cause regression.
 *
 * Proves the deterministic search-query layer no longer re-parses and strips
 * the model's structured search object. The prior bug: "šeimos automobilis"
 * was re-interpreted by the deterministic intent extractor as category=vehicles
 * + keyword "šeimos" (the category noun "automobilis" was discarded), so a
 * conversational refinement degraded the search object to a bare qualifier.
 *
 * These tests drive the REAL `searchListings` tool (and `normalizeProductSearchQuery`)
 * with the STRUCTURED args the planner emits (query / operation / preferences /
 * categoryAttributes), proving the semantic state transitions — not prose.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeAgentTool,
  type AgentToolContext,
  type AgentSearchFilters,
} from "../agent-tools.js";
import { normalizeProductSearchQuery } from "../product-search-query.js";

function ctxWith(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    userCity: "Lietuva",
    userRole: "buyer",
    contact: "",
    listingsSnapshot: [],
    myListings: [],
    ...overrides,
  };
}

function filtersOf(sideEffect: unknown): AgentSearchFilters {
  return ((sideEffect as { filters?: AgentSearchFilters })?.filters ??
    {}) as AgentSearchFilters;
}

describe("FC-SEARCH — structured query is not re-interpreted", () => {
  it("normalizeProductSearchQuery preserves the category noun", () => {
    const q = normalizeProductSearchQuery("šeimos automobilis");
    assert.ok(
      q.toLowerCase().includes("automobilis"),
      `category noun must be retained, got "${q}"`
    );
    assert.ok(
      q.toLowerCase().includes("šeimos"),
      `qualifier must be retained, got "${q}"`
    );
  });

  it("pure category noun still browses the whole category (no literal keyword)", () => {
    // "automobilis" alone → category browse, not a keyword "automobilis".
    const q = normalizeProductSearchQuery("automobilis");
    assert.equal(q, "", "pure category ask becomes a browse, not a keyword");
  });
});

describe("FC-SEARCH — transport multi-turn (structured planner args)", () => {
  it("family-car search → fuel refine → fuel replace → year refine → reset", async () => {
    // T1 — initial object + budget. The raw utterance carries the REAL failing
    // price condition ("iki 20 tūkstančių") so the authority fix is exercised:
    // the planner's structured maxPrice=20000 must survive the heuristic parse
    // that would otherwise collapse it to 20.
    const t1 = await executeAgentTool(
      "searchListings",
      { query: "šeimos automobilis", category: "vehicles", maxPrice: 20000 },
      ctxWith({ lastUserQuery: "ieškau šeimai automobilio iki 20 tūkstančių" })
    );
    const f1 = filtersOf(t1.sideEffect);
    assert.ok(
      (f1.query ?? "").toLowerCase().includes("automobilis"),
      `T1 object retained, got "${f1.query}"`
    );
    assert.equal(f1.maxPrice, 20000, "T1 €20,000 budget retained (not 20)");

    // T2 — fuel refinement must PRESERVE the object and ADD the fuel preference.
    const t2 = await executeAgentTool(
      "searchListings",
      { operation: "refine", preferences: { fuelType: "benzinas" } },
      ctxWith({
        lastUserQuery: "geriau benzinas",
        activeSearchFilters: f1,
      })
    );
    const f2 = filtersOf(t2.sideEffect);
    assert.ok(
      (f2.query ?? "").toLowerCase().includes("automobilis"),
      `T2 object still retained, got "${f2.query}"`
    );
    assert.equal(f2.preferences?.fuelType, "benzinas", "T2 fuel preference applied");
    assert.equal(f2.maxPrice, 20000, "T2 budget still retained");

    // T3 — fuel REPLACEMENT must replace benzinas with hibridas, not accumulate.
    const t3 = await executeAgentTool(
      "searchListings",
      { operation: "refine", preferences: { fuelType: "hibridas" } },
      ctxWith({
        lastUserQuery: "o gal vis dėlto hibridas",
        activeSearchFilters: f2,
      })
    );
    const f3 = filtersOf(t3.sideEffect);
    assert.equal(f3.preferences?.fuelType, "hibridas", "T3 fuel replaced");
    assert.ok(
      (f3.query ?? "").toLowerCase().includes("automobilis"),
      `T3 object retained, got "${f3.query}"`
    );

    // T4 — additive year refinement must not destroy the object/budget/fuel.
    const t4 = await executeAgentTool(
      "searchListings",
      { operation: "refine", categoryAttributes: { year: "2019" } },
      ctxWith({
        lastUserQuery: "ir nenoriu senesnio nei 2019 metų",
        activeSearchFilters: f3,
      })
    );
    const f4 = filtersOf(t4.sideEffect);
    assert.ok(
      (f4.query ?? "").toLowerCase().includes("automobilis"),
      `T4 object retained, got "${f4.query}"`
    );
    assert.equal(f4.categoryAttributes?.year, "2019", "T4 year attribute added");
    assert.equal(f4.preferences?.fuelType, "hibridas", "T4 fuel still retained");

    // T5 — reset must clear the search object entirely.
    const t5 = await executeAgentTool(
      "searchListings",
      { operation: "reset", query: "automobilis" },
      ctxWith({
        lastUserQuery: "pamiršk paskutinį reikalavimą",
        activeSearchFilters: f4,
      })
    );
    const f5 = filtersOf(t5.sideEffect);
    assert.ok(f5 !== undefined, "T5 reset returns a filters object");
  });
});

describe("FC-SEARCH — non-transport multi-turn (universality)", () => {
  it("real estate: object retained across budget + rooms refinements", async () => {
    const t1 = await executeAgentTool(
      "searchListings",
      { query: "butas", category: "real_estate", city: "Vilnius" },
      ctxWith({ lastUserQuery: "ieškau buto Vilniuje" })
    );
    const f1 = filtersOf(t1.sideEffect);
    assert.equal(f1.category, "real_estate", "T1 real_estate category");

    const t2 = await executeAgentTool(
      "searchListings",
      { operation: "refine", maxPrice: 120000 },
      ctxWith({
        lastUserQuery: "iki 120000",
        activeSearchFilters: f1,
      })
    );
    const f2 = filtersOf(t2.sideEffect);
    assert.equal(f2.maxPrice, 120000, "T2 budget applied");
    assert.equal(f2.category, "real_estate", "T2 category retained");

    const t3 = await executeAgentTool(
      "searchListings",
      { operation: "refine", categoryAttributes: { rooms: "3" } },
      ctxWith({
        lastUserQuery: "3 kambarių",
        activeSearchFilters: f2,
      })
    );
    const f3 = filtersOf(t3.sideEffect);
    assert.equal(f3.categoryAttributes?.rooms, "3", "T3 rooms attribute applied");
    assert.equal(f3.maxPrice, 120000, "T3 budget retained");
    assert.equal(f3.category, "real_estate", "T3 category retained");
  });

  it("electronics: object retained across a price/spec refinement and replacement", async () => {
    const t1 = await executeAgentTool(
      "searchListings",
      { query: "nešiojamas kompiuteris", category: "electronics" },
      ctxWith({ lastUserQuery: "ieškau nešiojamo kompiuterio" })
    );
    const f1 = filtersOf(t1.sideEffect);
    assert.ok(
      (f1.query ?? "").toLowerCase().includes("kompiuteris"),
      `T1 electronics object retained, got "${f1.query}"`
    );

    const t2 = await executeAgentTool(
      "searchListings",
      { operation: "refine", maxPrice: 500 },
      ctxWith({ lastUserQuery: "iki 500", activeSearchFilters: f1 })
    );
    const f2 = filtersOf(t2.sideEffect);
    assert.equal(f2.maxPrice, 500, "T2 budget applied");
    assert.ok(
      (f2.query ?? "").toLowerCase().includes("kompiuteris"),
      `T2 object retained, got "${f2.query}"`
    );

    const t3 = await executeAgentTool(
      "searchListings",
      { operation: "refine", preferences: { make: "Apple" } },
      ctxWith({ lastUserQuery: "geriau apple", activeSearchFilters: f2 })
    );
    const f3 = filtersOf(t3.sideEffect);
    assert.equal(f3.preferences?.make, "Apple", "T3 make preference applied");
    assert.ok(
      (f3.query ?? "").toLowerCase().includes("kompiuteris"),
      `T3 object retained, got "${f3.query}"`
    );
  });
});

describe("FC-SEARCH — fallback safety", () => {
  it("empty structured query falls back to the deterministic path without throwing", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "", category: "vehicles" },
      ctxWith({ lastUserQuery: "ieškau automobilio" })
    );
    const f = filtersOf(sideEffect);
    assert.ok(f !== undefined, "a filters object is always returned");
  });

  it("unknown/hallucinated category is dropped, not coerced", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "šeimos automobilis", category: "totally-not-a-category" },
      ctxWith({ lastUserQuery: "ieškau šeimai automobilio" })
    );
    const f = filtersOf(sideEffect);
    assert.ok(
      f.category !== "totally-not-a-category",
      "hallucinated category must not be persisted"
    );
  });
});

describe("FC-SEARCH — price authority (structured model value vs heuristic parse)", () => {
  it("maxPrice: structured 20000 survives heuristic 'iki 20 tūkstančių' → 20", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "šeimos automobilis", category: "vehicles", maxPrice: 20000 },
      ctxWith({ lastUserQuery: "ieškau šeimai automobilio iki 20 tūkstančių" })
    );
    const f = filtersOf(sideEffect);
    assert.equal(f.maxPrice, 20000, "structured maxPrice must not be overridden to 20");
  });

  it("minPrice: structured 5000 survives heuristic 'nuo 5 tūkstančių' → 5", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "šeimos automobilis", category: "vehicles", minPrice: 5000 },
      ctxWith({ lastUserQuery: "ieškau automobilio nuo 5 tūkstančių" })
    );
    const f = filtersOf(sideEffect);
    assert.equal(f.minPrice, 5000, "structured minPrice must not be overridden to 5");
  });

  it("fallback: absent structured value lets the heuristic supply a safe bound", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "telefonas" },
      ctxWith({ lastUserQuery: "telefonas iki 300" })
    );
    const f = filtersOf(sideEffect);
    assert.equal(f.maxPrice, 300, "heuristic fallback fills when the model omitted price");
  });

  it("real estate: structured budget survives conflicting heuristic parse", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "butas", category: "real_estate", city: "Vilnius", maxPrice: 150000 },
      ctxWith({ lastUserQuery: "ieškau buto iki 150 tūkstančių" })
    );
    const f = filtersOf(sideEffect);
    assert.equal(f.maxPrice, 150000, "real-estate budget must not collapse to 150");
  });

  it("electronics: structured price survives conflicting heuristic parse", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "nešiojamas kompiuteris", category: "electronics", maxPrice: 800 },
      ctxWith({ lastUserQuery: "noriu nešiojamo kompiuterio iki 800" })
    );
    const f = filtersOf(sideEffect);
    assert.equal(f.maxPrice, 800, "electronics budget must be preserved");
  });
});
