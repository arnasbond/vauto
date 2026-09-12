/**
 * R4.2 — multi-intent, preferences & dialogue reasoning.
 *
 * These tests verify the CORE mechanisms without a live model/DB:
 *  - soft preferences are bounded/normalized and NEVER become hard filters;
 *  - the planner schema represents a related subordinate goal (`secondary`)
 *    and soft preferences in `toolArgs.filters.preferences`;
 *  - the searchListings tool declaration exposes the preferences channel.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSearchPreferences, AGENT_FUNCTION_DECLARATIONS } from "../agent-tools.js";
import { PlannerDecisionSchema } from "../planner/planner-policy.js";
import {
  softPreferenceBoost,
  rankBySoftPreferences,
  mergeSearchPreferences,
} from "../search/soft-rank.js";

describe("R4.2 — soft preferences are bounded, never hard filters", () => {
  it("normalizes a valid preferences object", () => {
    const p = normalizeSearchPreferences({
      bodyType: "universalas",
      fuelType: "benzinas",
      preferredLocation: "Vilnius",
      maxPriceHint: 20000,
      alternatives: ["Audi", "Honda CR-V"],
      exclusions: ["dyzelis"],
    });
    assert.equal(p?.bodyType, "universalas");
    assert.equal(p?.fuelType, "benzinas");
    assert.equal(p?.preferredLocation, "Vilnius");
    assert.equal(p?.maxPriceHint, 20000);
    assert.deepEqual(p?.alternatives, ["Audi", "Honda CR-V"]);
    assert.deepEqual(p?.exclusions, ["dyzelis"]);
  });

  it("drops non-string fields and clamps arrays", () => {
    const p = normalizeSearchPreferences({
      bodyType: 123,
      fuelType: "",
      alternatives: ["a", "b", "c", "d", "e", "f", "g"],
    });
    assert.equal(p?.bodyType, undefined);
    assert.equal(p?.fuelType, undefined);
    assert.equal(p?.alternatives?.length, 6, "alternatives clamped to 6");
  });

  it("drops negative/non-finite maxPriceHint", () => {
    assert.equal(normalizeSearchPreferences({ maxPriceHint: -5 })?.maxPriceHint, undefined);
    assert.equal(normalizeSearchPreferences({ maxPriceHint: Number.NaN })?.maxPriceHint, undefined);
  });

  it("returns undefined for empty/invalid input", () => {
    assert.equal(normalizeSearchPreferences(undefined), undefined);
    assert.equal(normalizeSearchPreferences(null), undefined);
    assert.equal(normalizeSearchPreferences("x"), undefined);
    assert.equal(normalizeSearchPreferences({}), undefined);
  });
});

describe("R4.2 — planner represents multi-intent + preferences", () => {
  it("PlannerDecisionSchema accepts a related subordinate goal", () => {
    const parsed = PlannerDecisionSchema.parse({
      intent: "sell_create",
      goal: "sukurti skelbimą",
      continuationOf: "none",
      action: "create_listing_draft",
      tool: "create_listing_draft",
      toolArgs: {},
      secondary: {
        kind: "market_intelligence",
        note: "patikrinti panašių BMW kainas",
      },
      needsClarification: false,
      confidence: 0.9,
      reasons: ["sell_create"],
    });
    assert.equal(parsed.secondary?.kind, "market_intelligence");
    assert.equal(parsed.secondary?.note, "patikrinti panašių BMW kainas");
  });

  it("PlannerDecisionSchema accepts soft preferences in toolArgs.filters", () => {
    const parsed = PlannerDecisionSchema.parse({
      intent: "catalog_search",
      goal: "paieška su pageidavimais",
      continuationOf: "none",
      action: "catalog_search",
      tool: "searchListings",
      toolArgs: {
        filters: {
          preferences: {
            bodyType: "universalas",
            preferredLocation: "Vilnius",
            alternatives: ["Kaunas"],
          },
        },
      },
      needsClarification: false,
      confidence: 0.9,
      reasons: ["catalog_search"],
    });
    const prefs = (parsed.toolArgs as { filters?: { preferences?: Record<string, unknown> } }).filters?.preferences;
    assert.equal(prefs?.bodyType, "universalas");
    assert.equal(prefs?.preferredLocation, "Vilnius");
  });

  it("rejects an invalid secondary kind (fail closed)", () => {
    assert.throws(() =>
      PlannerDecisionSchema.parse({
        intent: "dialog",
        goal: "",
        continuationOf: "none",
        action: "",
        secondary: { kind: "autonomous_action", note: "x" },
        needsClarification: false,
        confidence: 0.5,
        reasons: [],
      })
    );
  });
});

describe("R4.2 — searchListings tool exposes the preferences channel", () => {
  it("declaration includes preferences with soft semantics", () => {
    const decl = AGENT_FUNCTION_DECLARATIONS.find((d) => d.name === "searchListings");
    assert.ok(decl, "searchListings declared");
    const props = (decl as { parameters?: { properties?: Record<string, unknown> } }).parameters?.properties;
    assert.ok(props?.preferences, "preferences property present");
  });
});

describe("R4.2 — soft preferences materially re-rank (never re-filter)", () => {
  const sedan = {
    id: "sedan",
    title: "BMW 320",
    category: "vehicles",
    location: "Kaunas",
    price: 18000,
    attributes: { bodyType: "sedanas", fuelType: "benzinas" },
  };
  const wagon = {
    id: "wagon",
    title: "BMW 320",
    category: "vehicles",
    location: "Kaunas",
    price: 18000,
    attributes: { bodyType: "universalas", fuelType: "benzinas" },
  };

  it("a preferred bodyType moves above a comparable non-match (Scenario A)", () => {
    const ranked = rankBySoftPreferences([sedan, wagon], { bodyType: "universalas" });
    assert.deepEqual(
      ranked.map((l) => l.id),
      ["wagon", "sedan"],
      "estate/wagon preference must move the wagon listing above the sedan"
    );
  });

  it("no preference → original order preserved", () => {
    const ranked = rankBySoftPreferences([sedan, wagon], undefined);
    assert.deepEqual(ranked.map((l) => l.id), ["sedan", "wagon"]);
  });

  it("preferredLocation boosts but does NOT exclude (Scenario B)", () => {
    const vilnius = { ...sedan, id: "vilnius", location: "Vilnius" };
    const kaunas = { ...sedan, id: "kaunas", location: "Kaunas" };
    const ranked = rankBySoftPreferences([kaunas, vilnius], {
      preferredLocation: "Vilnius",
      alternatives: ["Kaunas"],
    });
    assert.deepEqual(
      ranked.map((l) => l.id),
      ["vilnius", "kaunas"],
      "Vilnius ranks above Kaunas but Kaunas remains present (not excluded)"
    );
    assert.equal(ranked.length, 2, "no candidate was excluded");
  });

  it("exclusions deprioritize but do not remove (Scenario C)", () => {
    const diesel = { ...sedan, id: "diesel", attributes: { fuelType: "dyzelis" } };
    const petrol = { ...sedan, id: "petrol", attributes: { fuelType: "benzinas" } };
    const ranked = rankBySoftPreferences([diesel, petrol], {
      exclusions: ["dyzelis"],
    });
    assert.deepEqual(ranked.map((l) => l.id), ["petrol", "diesel"]);
    assert.equal(ranked.length, 2, "exclusion is soft — nothing removed");
  });

  it("alternatives provide fallback relevance (Scenario E)", () => {
    const rav4 = { ...sedan, id: "rav4", attributes: { make: "Toyota", model: "RAV4" } };
    const crv = { ...sedan, id: "crv", attributes: { make: "Honda", model: "CR-V" } };
    const ranked = rankBySoftPreferences([rav4, crv], { alternatives: ["CR-V"] });
    assert.deepEqual(
      ranked.map((l) => l.id),
      ["crv", "rav4"],
      "the alternative listing is boosted above the primary when it matches"
    );
  });

  it("boost is 0 with no preferences (no re-ranking)", () => {
    assert.equal(softPreferenceBoost(sedan, undefined), 0);
  });
});

describe("R4.2 — active preference evolution (replace-not-accumulate)", () => {
  it("scalar maxPriceHint is replaced, not accumulated (Scenario D)", () => {
    const merged = mergeSearchPreferences({ maxPriceHint: 20000 }, { maxPriceHint: 23000 });
    assert.equal(merged?.maxPriceHint, 23000);
  });

  it("relaxation removes a prior exclusion when it becomes an alternative (Scenario C)", () => {
    const merged = mergeSearchPreferences(
      { fuelType: "benzinas", exclusions: ["dyzelis"] },
      { alternatives: ["dyzelis"] }
    );
    assert.equal(merged?.fuelType, "benzinas");
    assert.ok(!(merged?.exclusions ?? []).includes("dyzelis"), "relaxed exclusion removed");
    assert.ok((merged?.alternatives ?? []).includes("dyzelis"));
  });

  it("preferredLocation survives when incoming omits it (Scenario B continuity)", () => {
    const merged = mergeSearchPreferences(
      { preferredLocation: "Vilnius", alternatives: ["Kaunas"] },
      { maxPriceHint: 23000 }
    );
    assert.equal(merged?.preferredLocation, "Vilnius");
    assert.deepEqual(merged?.alternatives, ["Kaunas"]);
    assert.equal(merged?.maxPriceHint, 23000);
  });

  it("undefined incoming returns prior unchanged", () => {
    assert.deepEqual(mergeSearchPreferences({ bodyType: "universalas" }, undefined), {
      bodyType: "universalas",
    });
  });
});
