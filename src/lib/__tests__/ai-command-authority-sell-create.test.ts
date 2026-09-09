/**
 * FAIL-FIRST — SELL/CREATE must NOT own catalog-search UI state.
 *
 * A server-authorized `listing_draft` action (SELL/CREATE) must still be
 * applied, but must never materialize the catalog search surface: it must not
 * write the raw sell text into `searchQuery`, must not scroll to the results
 * grid, and must not trigger the 0-result / wanted empty-state render.
 *
 * Regression guard: search-owning actions (search / empty_search /
 * apply_ui_filters / browse_all / register_wanted / create_user_requirement)
 * keep their existing ownership — E2.8 must not be weakened.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveCommandMaterialization,
  type CommandTurnOutcome,
} from "@/lib/ai-command-authority";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";

const SELL_TEXT = "Noriu įdėti buto skelbimą";

function listingDraft(category = "real_estate"): VautoAgentAction {
  return {
    type: "listing_draft",
    listingDraft: {
      title: "",
      price: 0,
      location: "",
      contact: "",
      category,
      confidence: 0.5,
    },
  };
}

function outcome(partial: Partial<CommandTurnOutcome>): CommandTurnOutcome {
  return { ok: false, ...partial };
}

describe("SELL/CREATE authority — listing_draft never owns catalog-search UI", () => {
  it("listing_draft applies but does NOT persist query or scroll (both paths)", () => {
    const draft = listingDraft();
    for (const path of ["conductor", "legacy"] as const) {
      const d = resolveCommandMaterialization(
        outcome({ actions: draft, ok: true, reply: "Ruošiu buto skelbimą…" }),
        SELL_TEXT,
        path
      );
      assert.equal(d.applyActions, draft, `${path}: draft must still be applied`);
      assert.equal(d.persistQuery, false, `${path}: sell text must not become searchQuery`);
      assert.equal(d.scrollToResults, false, `${path}: no results scroll for SELL/CREATE`);
      assert.equal(d.deterministicFallback, false, `${path}: no deterministic facet search`);
    }
  });

  it("listing_draft across verticals (real_estate, vehicles, electronics) never owns search", () => {
    for (const category of ["real_estate", "vehicles", "electronics", "jobs", "services"]) {
      const d = resolveCommandMaterialization(
        outcome({ actions: listingDraft(category), ok: true }),
        SELL_TEXT,
        "legacy"
      );
      assert.equal(d.persistQuery, false, category);
      assert.equal(d.scrollToResults, false, category);
      assert.notEqual(d.applyActions, null, category);
    }
  });

  it("no 0-result / wanted empty-state can derive from a SELL/CREATE turn", () => {
    // The invariant in decision terms: persistQuery must be false, so the
    // catalog grid (formatResultsLabel / WantedEmptyState / SearchEmptyAssistantBanner)
    // cannot be driven by the raw sell text for this turn.
    const d = resolveCommandMaterialization(
      outcome({ actions: listingDraft(), ok: true }),
      SELL_TEXT,
      "conductor"
    );
    assert.equal(d.persistQuery, false);
    assert.equal(d.scrollToResults, false);
  });
});

describe("SELL/CREATE authority — search ownership regression guard", () => {
  const SEARCH_OWNING: Array<[string, VautoAgentAction]> = [
    [
      "search",
      {
        type: "search",
        searchQuery: "Volvo V70",
        listingIds: ["a1"],
      },
    ],
    [
      "empty_search",
      { type: "empty_search", searchQuery: "Volvo V70" },
    ],
    [
      "apply_ui_filters",
      { type: "apply_ui_filters", query: "iki 20000" },
    ],
    [
      "browse_all",
      { type: "browse_all", replyMessage: "Visa rinka", listingCount: 42 },
    ],
    [
      "register_wanted",
      { type: "register_wanted", query: "Volvo V70" },
    ],
    [
      "create_user_requirement",
      { type: "create_user_requirement", query: "Volvo V70" },
    ],
  ];

  it("search-owning actions keep persistQuery=true", () => {
    for (const [label, action] of SEARCH_OWNING) {
      const d = resolveCommandMaterialization(
        outcome({ actions: action, ok: true }),
        "Volvo V70",
        "legacy"
      );
      assert.equal(d.persistQuery, true, label);
      assert.equal(d.applyActions, action, label);
    }
  });

  it("non-search actions (draft, consequential, navigation) never persist query", () => {
    const NON_SEARCH: Array<[string, VautoAgentAction]> = [
      ["listing_draft", listingDraft()],
      ["block_listing", { type: "block_listing", listingId: "x", reason: "r", pendingActionId: "p", expiresAt: "t" }],
      ["mark_listing_sold", { type: "mark_listing_sold", listingId: "x", pendingActionId: "p", expiresAt: "t" }],
      ["navigate", { type: "navigate", view: "add_listing" }],
      ["zero_ui_screen", { type: "zero_ui_screen", screen: "marketplace" }],
      ["micro_payment", { type: "micro_payment", reason: "boost", price: 5, product: "smart_boost" }],
      ["toggle_favorite", { type: "toggle_favorite", listingId: "x", added: true }],
      ["dismiss_listing", { type: "dismiss_listing", mode: "close" }],
      ["propose_bargaining", { type: "propose_bargaining", listingId: "x", listingTitle: "t", listingPrice: 100, discountPercentMin: 5, discountPercentMax: 15, suggestedOfferMin: 85, suggestedOfferMax: 95 }],
      ["wardrobe_bulk", { type: "wardrobe_bulk", items: [] }],
    ];
    for (const [label, action] of NON_SEARCH) {
      const d = resolveCommandMaterialization(
        outcome({ actions: action, ok: true }),
        "koks nors tekstas",
        "legacy"
      );
      assert.equal(d.persistQuery, false, label);
    }
  });
});
