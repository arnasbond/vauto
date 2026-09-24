/**
 * CORE v2 SINGLE SEARCH AUTHORITY INVARIANTS
 *
 * Protects the single-authority architecture after legacy frontend AI/search
 * authority excision.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlockedFallbackBubble } from "@/lib/agent-chat-layout";
import { buildDisplayListings } from "@/lib/display-listings-pipeline";
import { DEFAULT_MARKETPLACE_FILTERS, type MarketplaceFilterState } from "@/lib/marketplace-view";
import { canonicalFiltersToChips } from "@/components/marketplace/AiInterpretationChips";
import { shouldApplyAgentTurnAction } from "@/lib/agent-action-guard";
import type { Listing } from "@/lib/types";

const now = new Date().toISOString();

const mockListings: Listing[] = [
  {
    id: "item-1",
    title: "Canon i-SENSYS spausdintuvas",
    category: "electronics",
    price: 75,
    sellerId: "user-1",
    location: "Vilnius",
    description: "Spausdintuvas",
    createdAt: now,
    tags: [],
    images: [],
  },
  {
    id: "item-2",
    title: "Priekaba moderni",
    category: "other",
    price: 1700,
    sellerId: "user-2",
    location: "Kaunas",
    description: "Priekaba",
    createdAt: now,
    tags: [],
    images: [],
  },
  {
    id: "car-1",
    title: "Volvo XC90 2.4 D5",
    category: "vehicles",
    price: 15000,
    sellerId: "user-3",
    location: "Vilnius",
    description: "Patikimas šeimos automobilis",
    createdAt: now,
    tags: [],
    images: [],
  },
  {
    id: "car-2",
    title: "Toyota RAV4 Hybrid",
    category: "vehicles",
    price: 19500,
    sellerId: "user-4",
    location: "Klaipėda",
    description: "Šeimos visureigis",
    createdAt: now,
    tags: [],
    images: [],
  },
];

describe("CORE v2 Single Search Authority Invariants", () => {
  it("1. Valid Core v2 assistant text is NEVER blocked by text patterns", () => {
    const texts = [
      "Šiuo metu neradau konkrečių variantų pagal jūsų kriterijus.",
      "Deja, pagal jūsų užklausą neradau automobilių iki 20 tūkst. eurų.",
      "Atsiprašau, tokių variantų neturime.",
    ];
    for (const text of texts) {
      assert.equal(isBlockedFallbackBubble(text), false, `Text '${text}' must not be blocked`);
    }
  });

  it("2. Core v2 listingIds=[] yields EXACTLY zero results (default catalog does NOT leak)", () => {
    const res = buildDisplayListings({
      visibleListings: mockListings,
      searchQuery: "",
      agentPinnedListingIds: [], // Core v2 returned 0 matching listings
      marketplaceFilters: { ...DEFAULT_MARKETPLACE_FILTERS, category: "vehicles", priceMax: 20000 },
      activeFilterIds: new Set(),
      dynamicFilters: [],
      visualSearchProfile: null,
      visualRankScores: {},
      buyerCoords: null,
    });

    assert.deepEqual(res.listings, [], "Zero means zero — listings must be empty");
    assert.deepEqual(res.fallbackListings, [], "Fallback listings must be empty");
  });

  it("3. Core v2 listingIds=['car-1', 'car-2'] restricts visible result set to EXACTLY those IDs", () => {
    const res = buildDisplayListings({
      visibleListings: mockListings,
      searchQuery: "",
      agentPinnedListingIds: ["car-1", "car-2"],
      marketplaceFilters: DEFAULT_MARKETPLACE_FILTERS,
      activeFilterIds: new Set(),
      dynamicFilters: [],
      visualSearchProfile: null,
      visualRankScores: {},
      buyerCoords: null,
    });

    const resultIds = res.listings.map((l) => l.id);
    assert.deepEqual(resultIds, ["car-1", "car-2"]);
  });

  it("4. Classic manual search works independently when agentPinnedListingIds is null", () => {
    const res = buildDisplayListings({
      visibleListings: mockListings,
      searchQuery: "Volvo",
      agentPinnedListingIds: null, // Classic user search
      marketplaceFilters: DEFAULT_MARKETPLACE_FILTERS,
      activeFilterIds: new Set(),
      dynamicFilters: [],
      visualSearchProfile: null,
      visualRankScores: {},
      buyerCoords: null,
    });

    const resultIds = res.listings.map((l) => l.id);
    assert.deepEqual(resultIds, ["car-1"]);
  });

  it("5. AI-originated visible chips derive 100% from canonical Core v2 MarketplaceFilterState", () => {
    const coreV2Filters: MarketplaceFilterState = {
      ...DEFAULT_MARKETPLACE_FILTERS,
      category: "vehicles",
      priceMax: 20000,
      location: "Vilnius",
    };

    // Derived chips MUST match Core v2 filters exactly — no independent natural-language re-interpretation
    const chips = canonicalFiltersToChips(coreV2Filters);
    const chipFields = chips.map((c) => ({ field: c.field, value: c.value, label: c.label }));

    assert.deepEqual(chipFields, [
      { field: "category", value: "vehicles", label: "Transportas" },
      { field: "location", value: "Vilnius", label: "Vilnius" },
      { field: "priceMax", value: "20000", label: "Kaina iki 20000 €" },
    ]);
  });

  it("6. Core v2 turn originating from fromSearchBar with executable search action DOES apply canonical action to state", () => {
    const action = {
      type: "search" as const,
      searchQuery: "Volvo XC90",
      listingIds: ["car-1"],
      filters: { category: "vehicles" as const, priceMax: 20000 },
    };
    const originContext = { fromSearchBar: true };

    const shouldApply = shouldApplyAgentTurnAction(action, originContext);
    assert.equal(shouldApply, true, "Executable search action must be applied regardless of fromSearchBar origin");
  });
});
