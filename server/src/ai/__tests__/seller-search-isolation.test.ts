/**
 * Item 3/5 — Seller-flow search isolation in planner context.
 *
 * Verifies that the real planner-context construction boundary
 * (buildAgentPlannerContext) provides complete task-aware search isolation:
 * - In seller flows: search query, category, result count, and IDs are invisible to planner.
 * - Durable search state on threadSearchContext is NOT destroyed/deleted.
 * - Switching back to search seamlessly restores durable search state.
 * - No cross-task leakage across repeated alternation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentPlannerContext,
  type VautoAgentRequest,
} from "../vauto-agent.js";

function makeReq(
  contextOverrides: Partial<VautoAgentRequest["context"]> = {},
  messages: VautoAgentRequest["messages"] = [{ role: "user", text: "labas" }]
): VautoAgentRequest {
  return {
    messages,
    context: {
      userCity: "Vilnius",
      userRole: "buyer",
      ...contextOverrides,
    },
  };
}

describe("Item 3 — Seller-flow search isolation in planner context", () => {
  const sampleThreadSearchContext = {
    activeSearchFilters: {
      query: "Audi A4",
      category: "vehicles",
      city: "Kaunas",
      maxPrice: 8000,
    },
    lastSearchListingIds: ["hit-101", "hit-102", "hit-103"],
  };

  it("1. SEARCH active: planner context has search facts and result count", () => {
    const req = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: sampleThreadSearchContext,
      },
      [
        { role: "user", text: "ieškau Audi Kaune" },
        { role: "assistant", text: "Radau kelis variantus." },
        { role: "user", text: "patikslink iki 8000" },
      ]
    );

    const plannerCtx = buildAgentPlannerContext(req);

    assert.equal(plannerCtx.significantFacts?.searchQuery, "Audi A4");
    assert.equal(plannerCtx.significantFacts?.searchCategory, "vehicles");
    assert.equal(plannerCtx.significantFacts?.searchCity, "Kaunas");
    assert.equal(plannerCtx.significantFacts?.searchMaxPrice, "8000");
    assert.equal(plannerCtx.significantFacts?.searchResultCount, "3");
    assert.equal(plannerCtx.hasSearchSession, true);
  });

  it("2. SEARCH -> SELL: entering seller flow isolates search without destroying durable thread state", () => {
    const req = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: sampleThreadSearchContext,
        freshListingSession: true,
        userRole: "seller",
        listingDraft: {
          title: "Parduodu dviratį",
          price: 150,
          category: "bicycles",
        },
      },
      [{ role: "user", text: "noriu parduoti dviratį už 150" }]
    );

    const plannerCtx = buildAgentPlannerContext(req);

    // Search context must be completely absent from planner
    assert.equal(plannerCtx.significantFacts?.searchQuery, undefined);
    assert.equal(plannerCtx.significantFacts?.searchCategory, undefined);
    assert.equal(plannerCtx.significantFacts?.searchCity, undefined);
    assert.equal(plannerCtx.significantFacts?.searchMaxPrice, undefined);
    assert.equal(plannerCtx.significantFacts?.searchResultCount, undefined);
    assert.equal(plannerCtx.hasSearchSession, false);

    // Durable search state must NOT be destroyed on the request / thread context
    assert.ok(req.context.threadSearchContext, "threadSearchContext remains intact");
    assert.equal(req.context.threadSearchContext?.activeSearchFilters?.query, "Audi A4");
    assert.equal(req.context.threadSearchContext?.lastSearchListingIds?.length, 3);
  });

  it("3. SELL continues: wizardMode (listing_review / listing_edit) keeps stale buyer search invisible", () => {
    const req = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: sampleThreadSearchContext,
        wizardMode: "listing_review",
        listingDraft: {
          title: "Parduodu dviratį",
          price: 150,
        },
      },
      [{ role: "user", text: "taip, viskas gerai, patvirtinu" }]
    );

    const plannerCtx = buildAgentPlannerContext(req);

    assert.equal(plannerCtx.significantFacts?.searchQuery, undefined);
    assert.equal(plannerCtx.significantFacts?.searchResultCount, undefined);
    assert.equal(plannerCtx.hasSearchSession, false);
    assert.equal(plannerCtx.hasDraft, true);
    assert.equal(plannerCtx.draftTitle, "Parduodu dviratį");
  });

  it("4. SELL -> SEARCH: exiting seller flow restores legitimate durable search context", () => {
    const req = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: sampleThreadSearchContext,
        freshListingSession: false,
        wizardMode: "search",
        listingDraft: undefined,
      },
      [{ role: "user", text: "ką dar radai iš tų Audi?" }]
    );

    const plannerCtx = buildAgentPlannerContext(req);

    // Durable search context is restored
    assert.equal(plannerCtx.significantFacts?.searchQuery, "Audi A4");
    assert.equal(plannerCtx.significantFacts?.searchCategory, "vehicles");
    assert.equal(plannerCtx.significantFacts?.searchCity, "Kaunas");
    assert.equal(plannerCtx.significantFacts?.searchResultCount, "3");
  });

  it("5. Alternation: SEARCH -> SELL -> SEARCH -> SELL without cross-task leakage", () => {
    // Phase 1: Search
    const reqSearch1 = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: sampleThreadSearchContext,
      },
      [{ role: "user", text: "ieškau Audi" }]
    );
    const ctxSearch1 = buildAgentPlannerContext(reqSearch1);
    assert.equal(ctxSearch1.significantFacts?.searchQuery, "Audi A4");
    assert.equal(ctxSearch1.significantFacts?.searchResultCount, "3");
    assert.equal(ctxSearch1.hasDraft, false);

    // Phase 2: Switch to Sell
    const reqSell1 = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: sampleThreadSearchContext,
        freshListingSession: true,
        listingDraft: { title: "Parduodu telefoną", price: 300 },
      },
      [{ role: "user", text: "noriu parduoti telefoną" }]
    );
    const ctxSell1 = buildAgentPlannerContext(reqSell1);
    assert.equal(ctxSell1.significantFacts?.searchQuery, undefined);
    assert.equal(ctxSell1.significantFacts?.searchResultCount, undefined);
    assert.equal(ctxSell1.hasDraft, true);
    assert.equal(ctxSell1.draftTitle, "Parduodu telefoną");

    // Phase 3: Switch back to Search
    const reqSearch2 = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: sampleThreadSearchContext,
        freshListingSession: false,
        listingDraft: undefined,
      },
      [{ role: "user", text: "grįžkim prie Audi paieškos" }]
    );
    const ctxSearch2 = buildAgentPlannerContext(reqSearch2);
    assert.equal(ctxSearch2.significantFacts?.searchQuery, "Audi A4");
    assert.equal(ctxSearch2.significantFacts?.searchResultCount, "3");
    assert.equal(ctxSearch2.hasDraft, false);

    // Phase 4: Switch to Sell again
    const reqSell2 = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: sampleThreadSearchContext,
        wizardMode: "listing_edit",
        listingDraft: { title: "Dviratis Scott", price: 50 },
      },
      [{ role: "user", text: "pakeisk kainą į 50" }]
    );
    const ctxSell2 = buildAgentPlannerContext(reqSell2);
    assert.equal(ctxSell2.significantFacts?.searchQuery, undefined);
    assert.equal(ctxSell2.significantFacts?.searchResultCount, undefined);
    assert.equal(ctxSell2.hasDraft, true);
    assert.equal(ctxSell2.draftTitle, "Dviratis Scott");
  });

  it("6. Empty/no prior search: no fabricated search context", () => {
    const req = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: null,
        activeSearchFilters: null,
        recentSearchListingIds: [],
      },
      [{ role: "user", text: "labas vakaras" }]
    );

    const plannerCtx = buildAgentPlannerContext(req);

    const searchFactKeys = Object.keys(plannerCtx.significantFacts ?? {}).filter((k) =>
      k.startsWith("search")
    );
    assert.deepEqual(searchFactKeys, [], "no search keys fabricated");
    assert.equal(plannerCtx.hasSearchSession, false);
  });

  it("7. Listing draft state remains intact while search state is isolated", () => {
    const req = makeReq(
      {
        threadAuthoritative: true,
        threadSearchContext: sampleThreadSearchContext,
        freshListingSession: true,
        listingDraft: {
          title: "BMW 320d 2015",
          price: 6500,
          category: "vehicles",
          location: "Klaipėda",
          attributes: { kuro_tipas: "Dyzelinas" },
        },
      },
      [{ role: "user", text: "parduodu BMW 320d 2015 Klaipėdoje už 6500" }]
    );

    const plannerCtx = buildAgentPlannerContext(req);

    // Draft state is fully intact
    assert.equal(plannerCtx.hasDraft, true);
    assert.equal(plannerCtx.draftTitle, "BMW 320d 2015");
    assert.equal(plannerCtx.draftPrice, 6500);
    assert.equal(plannerCtx.draftCategory, "vehicles");
    assert.equal(plannerCtx.draftLocation, "Klaipėda");
    assert.equal(plannerCtx.significantFacts?.title, "BMW 320d 2015");
    assert.equal(plannerCtx.significantFacts?.price, "6500");
    assert.equal(plannerCtx.significantFacts?.category, "vehicles");
    assert.equal(plannerCtx.significantFacts?.location, "Klaipėda");

    // Search state is strictly isolated
    assert.equal(plannerCtx.significantFacts?.searchQuery, undefined);
    assert.equal(plannerCtx.significantFacts?.searchResultCount, undefined);
    assert.equal(plannerCtx.significantFacts?.searchCity, undefined);
    assert.equal(plannerCtx.significantFacts?.searchMaxPrice, undefined);
  });
});
