/**
 * R4.3D — universal capability semantics (deterministic, no model).
 *
 * Proves the marketplace capability routing distinguishes the fundamental
 * semantic sides (requester vs provider; job seeker vs employer; search vs
 * listing) WITHOUT phrase-specific classification at the planner layer, and
 * that a zero-result search never mutates into seller/listing intent.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectServerSellIntent,
  isJobSeekerListingCreateIntent,
} from "../sell-intent-fallback.js";
import { buildPlannerContext } from "../planner/planner-context-builder.js";
import { executeAgentTool, type AgentToolContext } from "../agent-tools.js";

describe("R4.3D — service request vs offer", () => {
  it("a requester looking for a service is NOT a seller intent", () => {
    assert.equal(detectServerSellIntent("reikia santechniko"), false);
    assert.equal(detectServerSellIntent("ieškau kas sutvarkytų stogą"), false);
  });

  it("a provider offering a service IS a seller/listing intent", () => {
    assert.equal(detectServerSellIntent("teikiu santechnikos paslaugas"), true);
    assert.equal(detectServerSellIntent("siūlau buto valymo paslaugas"), true);
  });
});

describe("R4.3D — job seeker vs employer", () => {
  it("a job seeker is recognized (not silently an employer listing)", () => {
    assert.equal(isJobSeekerListingCreateIntent("ieškau darbo vairuotoju"), true);
  });

  it("an employer offering a job is a listing intent (not a seeker)", () => {
    assert.equal(isJobSeekerListingCreateIntent("siūlau darbą vairuotojui"), false);
    assert.equal(detectServerSellIntent("siūlau darbą vairuotojui"), true);
    assert.equal(detectServerSellIntent("ieškome C kategorijos vairuotojo"), true);
  });

  it("a plain job search is not a job-seeker create", () => {
    assert.equal(isJobSeekerListingCreateIntent("reikia vairuotojo"), false);
  });
});

describe("R4.3D — zero result does not mutate into seller intent", () => {
  it("an empty search keeps search semantics (empty_search, not listing_draft)", async () => {
    const ctx: AgentToolContext = {
      userCity: "Lietuva",
      userRole: "buyer",
      contact: "",
      listingsSnapshot: [],
      myListings: [],
      lastUserQuery: "ieškau volvo",
    };
    const { sideEffect } = await executeAgentTool(
      "searchListings",
      { query: "volvo" },
      ctx
    );
    const type = (sideEffect as { type?: string } | undefined)?.type;
    assert.notEqual(type, "listing_draft", "search must not become a listing");
    assert.ok(type === "search" || type === "empty_search", "search side-effect preserved");
  });
});

describe("R4.3D — result referent visibility", () => {
  it("last shown result IDs are surfaced as a result-count fact", () => {
    const input = buildPlannerContext({
      messages: [{ role: "user", text: "šitas patinka" }],
      lastUserText: "šitas patinka",
      hasDraft: false,
      isAuthenticated: true,
      hasSearchSession: true,
      modelAvailable: true,
      activeSearchFilters: { query: "volvo", category: "vehicles" },
      lastSearchListingIds: ["l-1", "l-2", "l-3"],
    });
    assert.equal(input.significantFacts?.searchResultCount, "3");
    assert.equal(input.significantFacts?.searchQuery, "volvo");
  });

  it("no stale result referent when no results were shown", () => {
    const input = buildPlannerContext({
      messages: [{ role: "user", text: "o dabar butai" }],
      lastUserText: "o dabar butai",
      hasDraft: false,
      isAuthenticated: true,
      hasSearchSession: false,
      modelAvailable: true,
    });
    assert.equal(input.significantFacts?.searchResultCount, undefined);
  });
});
