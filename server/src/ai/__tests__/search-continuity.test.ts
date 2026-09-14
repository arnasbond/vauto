/**
 * R4.3B — search continuity through the REAL searchListings tool (deterministic).
 *
 * Proves the prior persisted search object is KEPT on a pure refinement, is
 * REPLACED when the user names a new object, and is not inherited on a SWITCH.
 * No live model; the SQL layer is absent in the test env and degrades to empty.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeAgentTool,
  type AgentToolContext,
  type AgentSearchFilters,
} from "../agent-tools.js";

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
  return ((sideEffect as { filters?: AgentSearchFilters })?.filters ?? {}) as AgentSearchFilters;
}

describe("R4.3B — search continuity (KEEP / REPLACE / SWITCH)", () => {
  it("KEEP: budget-only refinement preserves the prior object", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { maxPrice: 12000 },
      ctxWith({
        lastUserQuery: "gerai, tada iki 12000",
        activeSearchFilters: {
          query: "volvo",
          category: "vehicles",
          city: "Vilnius",
          maxPrice: 10000,
        },
      })
    );
    const f = filtersOf(sideEffect);
    assert.equal(f.query, "Volvo", "prior object is kept on refinement");
    assert.equal(f.maxPrice, 12000, "explicit new budget replaces the prior bound");
  });

  it("REPLACE: a newly named object replaces the prior object", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "bmw" },
      ctxWith({
        lastUserQuery: "ne, ne Audi, o BMW",
        activeSearchFilters: { query: "volvo", category: "vehicles" },
      })
    );
    const f = filtersOf(sideEffect);
    assert.ok(f.query && f.query.toLowerCase().includes("bmw"), "new object wins");
    assert.ok(!(f.query ?? "").toLowerCase().includes("volvo"), "prior object is not merged");
  });

  it("SWITCH: a genuinely new topic does not inherit stale state", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "iphone 13" },
      ctxWith({
        lastUserQuery: "o gal pažiūrėkim telefonus",
        activeSearchFilters: { query: "volvo", category: "vehicles" },
      })
    );
    const f = filtersOf(sideEffect);
    assert.ok(f.query && f.query.toLowerCase().includes("iphone"), "new topic wins");
    assert.ok(!(f.query ?? "").toLowerCase().includes("volvo"), "stale topic not inherited");
    assert.equal(f.city, undefined, "old city does not leak into the new object");
    assert.equal(f.maxPrice, undefined, "old budget does not leak into the new object");
    assert.equal(f.category, undefined, "old category does not leak into the new object");
    assert.equal(f.preferences, undefined, "old soft preferences do not leak into the new object");
  });

  it("REFINE: model repeating object query preserves category, city, minPrice, and preferences", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "volvo", maxPrice: 12000 },
      ctxWith({
        lastUserQuery: "volvo iki 12000",
        activeSearchFilters: {
          query: "volvo",
          category: "vehicles",
          city: "Vilnius",
          minPrice: 5000,
          preferences: { fuelType: "Dyzelinas" },
        },
      })
    );
    const f = filtersOf(sideEffect);
    assert.equal(f.query, "Volvo", "prior object query is preserved");
    assert.equal(f.category, "vehicles", "prior category is retained");
    assert.equal(f.city, "Vilnius", "prior city is retained");
    assert.equal(f.minPrice, 5000, "prior minPrice is retained");
    assert.equal(f.maxPrice, 12000, "new maxPrice is applied");
    assert.equal(f.preferences?.fuelType, "Dyzelinas", "prior preferences are retained");
  });

  it("reset: searchSessionReset discards the prior object", async () => {
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "iphone 13" },
      ctxWith({
        lastUserQuery: "nauja paieška: iphone 13",
        searchSessionReset: true,
        activeSearchFilters: { query: "volvo", category: "vehicles" },
      })
    );
    const f = filtersOf(sideEffect);
    assert.ok(f.query && f.query.toLowerCase().includes("iphone"), "fresh query used");
    assert.ok(!(f.query ?? "").toLowerCase().includes("volvo"), "prior discarded on reset");
  });
});
