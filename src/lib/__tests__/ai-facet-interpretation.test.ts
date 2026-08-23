import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretAiFacets } from "@/lib/ai-facet-interpretation";
import {
  applyAiFacet,
  removeAiFacet,
} from "@/lib/apply-ai-facet";
import { DEFAULT_MARKETPLACE_FILTERS } from "@/lib/marketplace-view";

// Stage 18A/18B — natural language → canonical facets (assembled as chips).
test("18A: real estate query interprets to canonical vertical + location + price + attribute", () => {
  const r = interpretAiFacets("Ieškau 2 kambarių buto Vilniuje iki 120 000 €");
  assert.equal(r.vertical, "real_estate");
  const chips = r.chips;

  const vertical = chips.find((c) => c.kind === "vertical");
  assert.ok(vertical);
  assert.equal(vertical!.value, "real_estate");

  const loc = chips.find((c) => c.kind === "location");
  assert.ok(loc);
  assert.equal(loc!.value, "Vilnius");

  const price = chips.find((c) => c.field === "priceMax");
  assert.ok(price);
  assert.equal(price!.value, "120000");

  const rooms = chips.find((c) => c.field === "rooms");
  assert.ok(rooms);
  // Canonical value equals the listing attribute format (plain digit) so the AI
  // chip really filters the result set (STAGE 18.2.1 MEDIUM-1).
  assert.equal(rooms!.value, "2");

  const propType = chips.find((c) => c.field === "propertyType");
  assert.ok(propType);
  assert.equal(propType!.value, "Butas");
});

test("18A: vehicle query maps to transport vertical + fuel + price", () => {
  const r = interpretAiFacets("Ekonomiškas dyzelinis universalas iki 7 000 €");
  assert.equal(r.vertical, "vehicles");
  const fuel = r.chips.find((c) => c.field === "fuelType");
  assert.ok(fuel);
  assert.equal(fuel!.value, "Dyzelinas");
  const price = r.chips.find((c) => c.field === "priceMax");
  assert.ok(price);
  assert.equal(price!.value, "7000");
});

test("18A: service query maps to vertical (no invented facets)", () => {
  const r = interpretAiFacets("Reikia elektriko Kaune");
  assert.equal(r.vertical, "services");
  const loc = r.chips.find((c) => c.kind === "location");
  assert.equal(loc?.value, "Kaunas");
});

test("18B: interpretation is deterministic and keyed to canonical fields", () => {
  const a = interpretAiFacets("Ieškau 2 kambarių buto Vilniuje iki 120 000 €");
  const b = interpretAiFacets("Ieškau 2 kambarių buto Vilniuje iki 120 000 €");
  assert.deepEqual(
    a.chips.filter((c) => c.kind !== "attribute" || true).map((c) => c.id),
    b.chips.map((c) => c.id)
  );
});

// Stage 18A/18B write side — chips map onto canonical filter state.
test("18A: remove a vertical chip resets category + attributes", () => {
  const applied = applyAiFacet(DEFAULT_MARKETPLACE_FILTERS, {
    type: "attribute",
    key: "propertyType",
    value: "Butas",
  });
  const next = removeAiFacet(applied, "category");
  assert.equal(next.category, "all");
  assert.deepEqual(next.categoryAttributes, {});
});

test("18A: applying a price chip writes canonical priceMax", () => {
  const next = applyAiFacet(DEFAULT_MARKETPLACE_FILTERS, {
    type: "price",
    field: "priceMax",
    value: 120000,
  });
  assert.equal(next.priceMax, 120000);
});

test("18A: removing a price chip clears priceMax", () => {
  const applied = applyAiFacet(DEFAULT_MARKETPLACE_FILTERS, {
    type: "price",
    field: "priceMax",
    value: 120000,
  });
  const next = removeAiFacet(applied, "priceMax");
  assert.equal(next.priceMax, null);
});

test("18A: applying an attribute chip writes canonical categoryAttributes", () => {
  const next = applyAiFacet(DEFAULT_MARKETPLACE_FILTERS, {
    type: "attribute",
    key: "fuelType",
    value: "Dyzelinas",
  });
  assert.equal(next.categoryAttributes?.["fuelType"], "Dyzelinas");
});

test("18A: removing an attribute chip clears that category key only", () => {
  const applied = applyAiFacet(
    applyAiFacet(DEFAULT_MARKETPLACE_FILTERS, {
      type: "attribute",
      key: "fuelType",
      value: "Dyzelinas",
    }),
    { type: "attribute", key: "bodyType", value: "Sedanas" }
  );
  const next = removeAiFacet(applied, "fuelType");
  assert.equal(next.categoryAttributes?.["fuelType"], undefined);
  assert.equal(next.categoryAttributes?.["bodyType"], "Sedanas");
});
