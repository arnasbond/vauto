/**
 * R4.2 — E/F/J targeted remediation evidence (production-path).
 *
 * E: bounded alternative fallback is category-neutral.
 * F: the model-carried `subject` referent flows through the planner contract.
 * J: an UNSEEN natural utterance flows raw → planner adapter (model stand-in)
 *    → structured preference + subject → schema/clamps → soft ranking.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { llmPlannerDecision } from "../planner/planner-llm.js";
import { PlannerDecisionSchema } from "../planner/planner-policy.js";
import type { PlannerLlmAdapter, PlannerStructuredRequest, PlannerStructuredResponse } from "../planner/planner-provider.js";
import {
  rankBySoftPreferences,
  retrieveAlternativeFallback,
} from "../search/soft-rank.js";

function semanticAdapter(
  decide: (req: PlannerStructuredRequest) => Record<string, unknown>
): PlannerLlmAdapter & { requests: PlannerStructuredRequest[] } {
  const requests: PlannerStructuredRequest[] = [];
  return {
    providerId: "fake-semantic",
    requests,
    async planStructured(req): Promise<PlannerStructuredResponse> {
      requests.push(req);
      return { args: decide(req), provider: "fake-semantic", model: "semantic-1" };
    },
  };
}

function ctx(lastUserText: string) {
  return {
    messages: [{ role: "user" as const, text: lastUserText }],
    lastUserText,
    hasDraft: false,
    isAuthenticated: true,
    hasSearchSession: true,
    modelAvailable: true,
  };
}

describe("R4.2 E — alternative fallback is OR (not AND), category-neutral", () => {
  it("multiple alternatives are retrieved independently (OR, never a conjunction)", async () => {
    const catalog = new Map<string, { id: string; title: string; category: string; location: string; price: number; attributes: Record<string, string> }>();
    catalog.set("g", { id: "g", title: "Samsung Galaxy S24", category: "electronics", location: "Vilnius", price: 800, attributes: {} });
    catalog.set("p", { id: "p", title: "Google Pixel 9", category: "electronics", location: "Kaunas", price: 750, attributes: {} });

    const retrieve = async (q: string) =>
      Array.from(catalog.values()).filter((l) =>
        l.title.toLowerCase().includes(q.toLowerCase())
      );

    const rows = await retrieveAlternativeFallback(
      ["Galaxy S24", "Pixel 9"],
      retrieve,
      undefined
    );
    assert.deepEqual(
      rows.map((l) => l.id).sort(),
      ["g", "p"],
      "both independent alternatives are returned — no listing matches BOTH"
    );
  });

  it("single multi-token alternative is one target", async () => {
    const rows = await retrieveAlternativeFallback(
      ["Galaxy S24"],
      async (q) => [{ id: "g", title: "Samsung Galaxy S24", category: "electronics", location: "Vilnius", price: 800, attributes: {} }],
      undefined
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, "g");
  });

  it("deduplicates and preserves primary-first ordering", async () => {
    const listings = [
      { id: "a", title: "Samsung Galaxy S24", category: "electronics", location: "Vilnius", price: 800, attributes: {} },
      { id: "b", title: "Google Pixel 9", category: "electronics", location: "Vilnius", price: 750, attributes: {} },
    ];
    const retrieve = async () => listings;
    const rows = await retrieveAlternativeFallback(
      ["Galaxy S24", "Pixel 9"],
      retrieve,
      { alternatives: ["Pixel 9"] }
    );
    // Pixel 9 matches the preference alternative → ranks above Galaxy S24.
    assert.deepEqual(rows.map((l) => l.id), ["b", "a"]);
  });

  it("non-automotive (real estate) alternatives work identically", async () => {
    const catalog = [
      { id: "z", title: "Butas Žirmūnuose", category: "real_estate", location: "Žirmūnai", price: 120000, attributes: {} },
      { id: "a", title: "Butas Antakalnyje", category: "real_estate", location: "Antakalnis", price: 115000, attributes: {} },
    ];
    const retrieve = async (q: string) =>
      catalog.filter((l) => l.location.toLowerCase().includes(q.toLowerCase()));
    const rows = await retrieveAlternativeFallback(
      ["Žirmūnai", "Antakalnis"],
      retrieve,
      undefined
    );
    assert.equal(rows.length, 2);
  });
});

describe("R4.2 F — conversational subject referent (model-resolved, structured)", () => {
  it("PlannerDecisionSchema accepts and carries `subject`", () => {
    const parsed = PlannerDecisionSchema.parse({
      intent: "catalog_search",
      goal: "search",
      continuationOf: "none",
      action: "catalog_search",
      tool: "searchListings",
      toolArgs: { query: "BMW" },
      subject: "BMW 320",
      needsClarification: false,
      confidence: 0.9,
      reasons: [],
    });
    assert.equal(parsed.subject, "BMW 320");
  });

  it("llmPlannerDecision carries `subject` from the semantic adapter", async () => {
    const adapter = semanticAdapter(() => ({
      intent: "catalog_search",
      goal: "search",
      continuationOf: "none",
      action: "catalog_search",
      tool: "searchListings",
      toolArgs: { query: "BMW" },
      subject: "BMW 320",
      needsClarification: false,
      confidence: 0.9,
      reasons: [],
    }));
    const d = await llmPlannerDecision(ctx("Surask BMW"), adapter);
    assert.equal(d.subject, "BMW 320");
  });
});

describe("R4.2 J — unseen paraphrase through semantic planner interpretation", () => {
  // Deliberately NOT present in prompts/tests/regexes/fixtures.
  const UNSEEN =
    "Surask BMW 320, bet jeigu rasi universalą — verčiau tą, ne sedaną.";

  it("raw unseen utterance → adapter (model stand-in) → structured preference + subject → ranking", async () => {
    const adapter = semanticAdapter((req) => {
      // The adapter simulates the MODEL's semantic interpretation of the raw
      // utterance: it derives the structured preference from MEANING, not from
      // a phrase table. It returns the same structure the model would emit.
      assert.ok(
        req.parts.lastUserText.includes("universalą"),
        "adapter received the RAW unseen utterance"
      );
      return {
        intent: "catalog_search",
        goal: "search with body preference",
        continuationOf: "search_session",
        action: "catalog_search",
        tool: "searchListings",
        toolArgs: {
          query: "BMW 320",
          filters: { preferences: { bodyType: "universalas" } },
        },
        subject: "BMW 320",
        needsClarification: false,
        confidence: 0.9,
        reasons: ["search_preference"],
      };
    });

    const decision = await llmPlannerDecision(ctx(UNSEEN), adapter);
    const prefs = (decision.toolArgs as { filters?: { preferences?: { bodyType?: string } } })
      .filters?.preferences;
    assert.equal(prefs?.bodyType, "universalas");
    assert.equal(decision.subject, "BMW 320");

    // Downstream: the structured preference materially re-ranks.
    const sedan = { id: "s", title: "BMW 320", category: "vehicles", location: "Kaunas", price: 17000, attributes: { bodyType: "sedanas" } };
    const wagon = { id: "w", title: "BMW 320", category: "vehicles", location: "Kaunas", price: 17000, attributes: { bodyType: "universalas" } };
    const ranked = rankBySoftPreferences([sedan, wagon], { bodyType: "universalas" });
    assert.deepEqual(ranked.map((l) => l.id), ["w", "s"]);
  });
});
