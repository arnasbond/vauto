import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretAiFacets } from "@/lib/ai-facet-interpretation";
import {
  resolveAiVertical,
  hasWordBoundaryMatch,
} from "@/lib/ai-vertical-adapter";
import {
  applyAiFacet,
  removeAiFacet,
  applyFacetChips,
} from "@/lib/apply-ai-facet";
import { DEFAULT_MARKETPLACE_FILTERS } from "@/lib/marketplace-view";
import { mergeAgentIntoMarketplaceFilters } from "@/lib/marketplace-view";

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

// ===== STAGE 21B — AI-DOWN deterministic fallback chain =====
// AI DOWN ≠ VAUTO DOWN: when the agent is unavailable, AiCommandBar runs
// interpretAiFacets → applyFacetChips onto the canonical filter state. These
// tests prove the exact chain the fallback path executes stays deterministic
// and preserves canonical category values.

test("21B: AI-DOWN chain — full interpretation applies canonical vertical, location, price and attributes", () => {
  const r = interpretAiFacets("Ieškau 2 kambarių buto Vilniuje iki 120 000 €");
  const next = applyFacetChips(DEFAULT_MARKETPLACE_FILTERS, r.chips);
  assert.equal(next.category, "real_estate");
  assert.equal(next.location, "Vilnius");
  assert.equal(next.priceMax, 120000);
  assert.equal(next.categoryAttributes?.["rooms"], "2");
  assert.equal(next.categoryAttributes?.["propertyType"], "Butas");
});

test("21B: AI-DOWN chain — vehicle query applies canonical fuelType + priceMax", () => {
  const r = interpretAiFacets("Ekonomiškas dyzelinis universalas iki 7 000 €");
  const next = applyFacetChips(DEFAULT_MARKETPLACE_FILTERS, r.chips);
  assert.equal(next.category, "vehicles");
  assert.equal(next.priceMax, 7000);
  assert.equal(next.categoryAttributes?.["fuelType"], "Dyzelinas");
});

test("21B: AI-DOWN chain — unknown query stays on canonical defaults with residual text preserved", () => {
  // 21C-3: previously used "zq xq wq vq" as a workaround because "kažkokia"
  // (which contains the "kia" substring) false-positived to vehicles. The
  // word-boundary fix makes this exact false-positive impossible, so we now
  // assert it directly here.
  const r = interpretAiFacets("kažkokia knyga");
  assert.equal(r.vertical, "all");
  assert.equal(r.chips.length, 0);
  // residualQuery must preserve the original user text so the classic search
  // still sees it (best-effort extraction, never dropping the user's intent).
  assert.equal(r.residualQuery.trim(), "kažkokia knyga");
  const next = applyFacetChips(DEFAULT_MARKETPLACE_FILTERS, r.chips);
  assert.deepEqual(next.categoryAttributes, {});
  assert.equal(next.category, "all");
});

test("21B: AI-DOWN chain — partial parse keeps supported facets and never invents canonical values", () => {
  const r = interpretAiFacets("Automobilis Kaune");
  const next = applyFacetChips(DEFAULT_MARKETPLACE_FILTERS, r.chips);
  assert.equal(next.category, "vehicles");
  assert.equal(next.location, "Kaunas");
  // No price was mentioned — no invented price facet.
  assert.equal(next.priceMin, null);
  assert.equal(next.priceMax, null);
});

// ===== STAGE 21C-3 — interpretation correctness hardening =====
// Word-boundary matching: a synonym may only fire at the START of a word, and
// short standalone tokens (marks/acronyms) require an exact whole-word match.
// These regressions lock in the fix without changing canonical domain semantics.

test("21C-3: mid-word substring cannot fire a vertical synonym — 'kažkokia' stays non-vehicle", () => {
  // "kažkokia" contains "kia" as a substring; word-boundary matching must not
  // activate the TRANSPORT synonym list.
  assert.equal(resolveAiVertical("kažkokia knyga"), "all");
  // The HOME_GARDEN match below fires only because of the explicit "sofa"
  // stem — never because of a fragment of "kažkokia".
  assert.equal(resolveAiVertical("Kažkokia sofa"), "home");
  const r = interpretAiFacets("Kažkokia sofa");
  assert.equal(r.vertical, "home");
});

test("21C-3: standalone 'kia' still resolves to vehicles (exact short token)", () => {
  assert.equal(resolveAiVertical("kia"), "vehicles");
  assert.equal(resolveAiVertical("kia sportage 2019"), "vehicles");
});

test("21C-3: short acronyms require exact word — 'suvartoti' is not 'suv'", () => {
  assert.equal(resolveAiVertical("suv"), "vehicles");
  assert.equal(resolveAiVertical("suvartoti"), "all");
  assert.equal(resolveAiVertical("norėčiau suvartoti duonos"), "all");
});

test("21C-3: short vehicle marks resolve exactly — vw/bmw without false mid-word hits", () => {
  assert.equal(resolveAiVertical("vw golf"), "vehicles");
  assert.equal(resolveAiVertical("bmw 320"), "vehicles");
  // "dvw" or "bmwx" are not valid tokens — must not match.
  assert.equal(resolveAiVertical("dvw"), "all");
});

test("21C-3: Lithuanian declensions still match via word prefixes", () => {
  // Genitive/plural forms of stems must keep resolving.
  assert.equal(resolveAiVertical("dviejų kambarių buto"), "real_estate");
  assert.equal(resolveAiVertical("buto nuoma"), "real_estate");
  assert.equal(resolveAiVertical("dyzelinis automobilis"), "vehicles");
  assert.equal(resolveAiVertical("universalas"), "vehicles");
  assert.equal(resolveAiVertical("elektriko paslauga"), "services");
});

test("21C-3: short HOME_GARDEN stems (ind/sof) keep prefix matching", () => {
  // "indas"/"indai" and "sofa"/"sofos" are stems — they must keep working.
  assert.equal(resolveAiVertical("indai"), "home");
  assert.equal(resolveAiVertical("indas"), "home");
  assert.equal(resolveAiVertical("sofa"), "home");
  assert.equal(resolveAiVertical("sofos kampelis"), "home");
});

test("21C-3: word-boundary helper rejects mid-word fragments and accepts prefixes", () => {
  // Direct helper assertions (exported for the regression suite).
  assert.equal(hasWordBoundaryMatch("kažkokia knyga", ["kia"]), false);
  assert.equal(hasWordBoundaryMatch("kia sportage", ["kia"]), true);
  assert.equal(hasWordBoundaryMatch("suvartoti", ["suv"]), false);
  assert.equal(hasWordBoundaryMatch("suv", ["suv"]), true);
  assert.equal(hasWordBoundaryMatch("dyzelinis", ["dyzel"]), true);
  assert.equal(hasWordBoundaryMatch("dyzelinis", ["benzin"]), false);
  // Multi-word phrases keep substring semantics.
  assert.equal(hasWordBoundaryMatch("technikos nuoma", ["technikos nuom"]), true);
});

// ===== STAGE 21C-1 — one canonical intent state =====
// There is exactly ONE committed intent state (VautoSearchContext.searchQuery +
// marketplaceFilters). Draft mirrors (liveDraft/draftQuery) are readout-only.
// The interpretation apply must be idempotent: applying the same query twice
// (fresh mount after an AI-UP agent response) never rewrites canonical state.

test("21C-1: interpretation apply is idempotent — re-applying the same query is a no-op", () => {
  const r = interpretAiFacets("Ieškau 2 kambarių buto Vilniuje iki 120 000 €");
  const first = applyFacetChips(DEFAULT_MARKETPLACE_FILTERS, r.chips);
  const second = applyFacetChips(first, r.chips);
  assert.equal(first.category, "real_estate");
  assert.equal(first.location, "Vilnius");
  assert.equal(first.priceMax, 120000);
  // Re-apply on the already-committed state must yield the exact same values
  // (the 21C-1 idempotency guard in AiInterpretationChips skips onValueChange
  // when every canonical field is already equal).
  assert.equal(second.category, first.category);
  assert.equal(second.location, first.location);
  assert.equal(second.priceMax, first.priceMax);
  assert.equal(second.condition, first.condition);
  assert.equal(second.radiusKm, first.radiusKm);
  assert.deepEqual(second.categoryAttributes, first.categoryAttributes);
});

test("21C-1: AI-UP agent response and AI-DOWN interpretation both write the SAME canonical model", () => {
  // AI-UP path writes filters via mergeAgentIntoMarketplaceFilters (the agent
  // adapter); AI-DOWN writes via applyFacetChips (the deterministic adapter).
  // Both produce a MarketplaceFilterState with the same canonical keys — never
  // a second "AI truth".
  const r = interpretAiFacets("Dyzelinis automobilis iki 7 000 €");
  const aiDown = applyFacetChips(DEFAULT_MARKETPLACE_FILTERS, r.chips);
  assert.equal(aiDown.category, "vehicles");
  assert.equal(aiDown.priceMax, 7000);
  assert.equal(aiDown.categoryAttributes?.["fuelType"], "Dyzelinas");

  const agentFilters = mergeAgentIntoMarketplaceFilters(DEFAULT_MARKETPLACE_FILTERS, {
    query: "Dyzelinis automobilis iki 7 000 €",
    category: "vehicles",
    maxPrice: 7000,
    categoryAttributes: { fuelType: "Dyzelinas" },
  });
  assert.equal(agentFilters.category, "vehicles");
  assert.equal(agentFilters.priceMax, 7000);
  assert.equal(agentFilters.categoryAttributes?.["fuelType"], "Dyzelinas");
});

// ===== STAGE 21D-4 — MALFORMED / UNKNOWN INTENT RECOVERY =====
// Unknown or partial natural-language input must degrade gracefully:
// never invent confident canonical facets, never drop the user's original
// text, and always keep a deterministic usable state (AI-DOWN).

test("21D-4: empty/whitespace query yields no facets and preserves empty residual", () => {
  const r = interpretAiFacets("   ");
  assert.equal(r.vertical, "all");
  assert.equal(r.chips.length, 0);
  assert.equal(r.residualQuery.trim(), "");
});

test("21D-4: unknown gibberish query stays on defaults — no false-confident facets", () => {
  const r = interpretAiFacets("zqxw vtrp mlksn");
  assert.equal(r.vertical, "all");
  assert.equal(r.chips.length, 0);
  // Original text is preserved for the classic keyword search.
  assert.equal(r.residualQuery.trim(), "zqxw vtrp mlksn");
});

test("21D-4: very short ambiguous input ('kia') resolves only to the vertical — no invented price/condition", () => {
  const r = interpretAiFacets("kia");
  assert.equal(r.vertical, "vehicles");
  const kinds = r.chips.map((c) => c.kind);
  assert.ok(kinds.includes("vertical"), "vertical chip present");
  assert.ok(!kinds.includes("price"), "no invented price for short mark");
  assert.ok(!kinds.includes("condition"), "no invented condition");
  // Keyword (make) chip is fine — it maps to the search box, not a facet.
  assert.ok(kinds.includes("keyword"), "make keyword chip present");
});

test("21D-4: numbers/prices without context do not invent verticals", () => {
  // "iki 120000" (4+ digits) is a confident price bound; no vertical invented.
  const r = interpretAiFacets("iki 120000");
  assert.equal(r.vertical, "all");
  const price = r.chips.find((c) => c.field === "priceMax");
  assert.ok(price, "price bound parsed");
  assert.equal(price!.value, "120000");
  // A bare 3-digit number is NOT a confident marketplace price (price parser
  // requires 4+ digits) — no invented facet, original text preserved.
  const short = interpretAiFacets("500");
  assert.equal(short.vertical, "all");
  assert.equal(short.chips.length, 0, "no invented facet for ambiguous short number");
  assert.equal(short.residualQuery.trim(), "500");
});

test("21D-4: unknown location is not silently invented — original text preserved", () => {
  const r = interpretAiFacets("butas NežinomasMiestas");
  assert.equal(r.vertical, "real_estate");
  const loc = r.chips.find((c) => c.kind === "location");
  assert.equal(loc, undefined, "unknown city must not become a canonical location facet");
  // Residual keeps the city token for the keyword search.
  assert.ok(/nežinomasmiestas/i.test(r.residualQuery), "city preserved in residual");
});

test("21D-4: mixed-category query prefers the dominant vertical and never invents cross-vertical attributes", () => {
  // Transport + real-estate vocabulary: the adapter deterministically picks one
  // vertical; attribute facets from the OTHER vertical must not leak.
  const r = interpretAiFacets("butas ir bmw");
  assert.equal(r.vertical, "real_estate");
  const fields = r.chips.map((c) => c.field);
  assert.ok(!fields.includes("fuelType"), "vehicle fuelType must not leak into RE");
  assert.ok(!fields.includes("bodyType"), "vehicle bodyType must not leak into RE");
  assert.ok(!fields.includes("mileageMax"), "vehicle mileage must not leak into RE");
});

test("21D-4: spelling variation ('ieskau', 'buto') still resolves deterministically", () => {
  const r = interpretAiFacets("ieskau 3 kambariu buto kaune iki 90000");
  assert.equal(r.vertical, "real_estate");
  const loc = r.chips.find((c) => c.kind === "location");
  assert.equal(loc?.value, "Kaunas");
  const rooms = r.chips.find((c) => c.field === "rooms");
  assert.equal(rooms?.value, "3");
});

test("21D-4: long verbose query does not crash and extracts only confident facets", () => {
  const long =
    "Labas, noreciau rasti gera ir pigia 2 kambariu buta Vilniuje, " +
    "geriausiai senamiestyje, su balkonu, iki 150000 euru, bet jei nerasi, " +
    "gali buti ir 3 kambariu, svarbiausia kad tylu ir saugu. Aciu!";
  const r = interpretAiFacets(long);
  assert.equal(r.vertical, "real_estate");
  const loc = r.chips.find((c) => c.kind === "location");
  assert.equal(loc?.value, "Vilnius");
  const price = r.chips.find((c) => c.field === "priceMax");
  assert.equal(price?.value, "150000");
  assert.ok(r.residualQuery.length > 0, "residual text preserved");
});

// ===== STAGE 21D-5 — VERTICAL TRANSITION SAFETY =====
// When the category changes, incompatible vertical-specific facets must never
// leak into the new vertical; shared facets (location/price) survive only when
// semantically justified by canonical state rules.

test("21D-5: real_estate rooms=3 is fully cleared by a vehicle query (BMW X5)", () => {
  const re = applyFacetChips(
    DEFAULT_MARKETPLACE_FILTERS,
    interpretAiFacets("3 kambarių butas Vilniuje iki 120 000 €").chips
  );
  assert.equal(re.category, "real_estate");
  assert.equal(re.categoryAttributes?.rooms, "3");
  assert.equal(re.categoryAttributes?.propertyType, "Butas");

  // User then searches "BMW X5 iki 25000" — the vehicles interpretation must
  // reset the RE-only attributes (rooms, propertyType) and carry no leftovers.
  const veh = applyFacetChips(re, interpretAiFacets("BMW X5 iki 25 000 €").chips);
  assert.equal(veh.category, "vehicles");
  assert.equal(veh.categoryAttributes?.rooms, undefined, "rooms must not leak");
  assert.equal(
    veh.categoryAttributes?.propertyType,
    undefined,
    "propertyType must not leak"
  );
  assert.equal(veh.categoryAttributes?.fuelType, undefined, "no invented fuel");
});

test("21D-5: vehicles fuelType does not contaminate a later real-estate query", () => {
  const veh = applyFacetChips(
    DEFAULT_MARKETPLACE_FILTERS,
    interpretAiFacets("Dyzelinis automobilis iki 7 000 €").chips
  );
  assert.equal(veh.category, "vehicles");
  assert.equal(veh.categoryAttributes?.fuelType, "Dyzelinas");

  const re = applyFacetChips(veh, interpretAiFacets("butas Kaune").chips);
  assert.equal(re.category, "real_estate");
  assert.equal(re.categoryAttributes?.fuelType, undefined, "fuelType must not leak");
  assert.equal(re.categoryAttributes?.bodyType, undefined, "bodyType must not leak");
  // Shared location survives only when the new query re-asserts it.
  assert.equal(re.location, "Kaunas", "new query location applies");
});

test("21D-5: electronics → services → jobs → home transitions leave no incompatible attrs", () => {
  const elec = applyFacetChips(
    DEFAULT_MARKETPLACE_FILTERS,
    interpretAiFacets("MacBook Pro iki 1500 €").chips
  );
  assert.equal(elec.category, "electronics");

  const services = applyFacetChips(elec, interpretAiFacets("Reikia elektriko").chips);
  assert.equal(services.category, "services");
  assert.deepEqual(services.categoryAttributes ?? {}, {}, "services has no leaked attrs");

  const jobs = applyFacetChips(services, interpretAiFacets("darbas nuotoliu").chips);
  assert.equal(jobs.category, "jobs");
  assert.equal(jobs.categoryAttributes?.locationType, "Nuotolinis");

  const home = applyFacetChips(jobs, interpretAiFacets("sofa").chips);
  assert.equal(home.category, "home");
  assert.equal(
    home.categoryAttributes?.locationType,
    undefined,
    "job locationType must not leak into home"
  );
});

test("21D-5: shared location/price survive across verticals only when semantically justified", () => {
  // User searched RE in Vilnius with a price cap, then switches to vehicles via
  // a query that has NO location. The shared location must be dropped by the
  // AI write bridge ONLY when a new query intentionally clears it — here the
  // deterministic adapter merges onto the current state, so a fresh query with
  // no location must not keep the stale one (merge is per-query state).
  const re = applyFacetChips(
    DEFAULT_MARKETPLACE_FILTERS,
    interpretAiFacets("2 kambarių butas Vilniuje iki 120 000 €").chips
  );
  assert.equal(re.location, "Vilnius");

  // applyFacetChips starts from the current state; a vehicles interpretation
  // that does not mention a city leaves the location field untouched. That is
  // the documented canonical rule — location survives until the user removes it
  // or a new location is authored. This test asserts the deterministic behavior
  // (survival is semantic, not accidental).
  const veh = applyFacetChips(re, interpretAiFacets("BMW X5 iki 25 000 €").chips);
  assert.equal(veh.category, "vehicles");
  assert.equal(veh.location, "Vilnius", "shared location survives (user-authored)");
  assert.equal(veh.priceMax, 25000, "new price wins");
  assert.equal(veh.categoryAttributes?.rooms, undefined, "RE rooms dropped");
});
