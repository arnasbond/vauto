/**
 * FAIL-FIRST — sell→search semantic execution authority.
 *
 * "Noriu įdėti buto skelbimą" is an explicit CREATE/SELL goal and must never
 * execute catalog search. Asserts the full authority matrix at three levels:
 * heuristic (detectServerSellIntent), deterministic planner (planTurn), and
 * the real route (runVautoAgent, fromSearchBar=true).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { detectServerSellIntent } from "../../sell-intent-fallback.js";
import { planTurn } from "../../planner/planner-engine.js";
import type { PlannerContextInput } from "../../planner/planner-types.js";
import { setPlannerDecisionProviderForTests, setPlannerAdapterForTests } from "../../planner/planner-orchestrator.js";
import type { PlannerLlmAdapter, PlannerStructuredRequest, PlannerStructuredResponse } from "../../planner/planner-provider.js";
import { runVautoAgent } from "../../vauto-agent.js";
import type { VautoAgentRequest } from "../../vauto-agent.js";
import { createScriptedModelProvider, round, text as textPart } from "../../../golden/harness/scripted-model-provider.js";

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  setPlannerDecisionProviderForTests(null);
});

const SELL_CASES = [
  "Noriu įdėti buto skelbimą",
  "Noriu įkelti buto skelbimą",
  "Noriu parduoti butą",
  "Parduodu butą",
  "Įdėk mano buto skelbimą",
  "Padėk įkelti skelbimą",
  "Noriu parduoti telefoną",
  "Parduodu automobilį",
];

const SEARCH_CASES = [
  "Noriu pirkti butą",
  "Ieškau buto",
  "Parodyk parduodamus butus",
  "Rask butą Vilniuje",
  "Ieškau naudoto telefono",
];

const ADVISORY_CASES = [
  "Kiek galėčiau gauti už savo butą?",
  "Ar verta dabar parduoti butą?",
  "Kaip geriau parduoti butą?",
  "Galvoju parduoti, bet kol kas tik noriu sužinoti kainą",
];

const NEGATION_CASES = [
  "Nenoriu parduoti, noriu pirkti butą",
  "Ne įdėti skelbimą, o paieškoti buto",
];

const AMBIGUOUS_CASES = ["Butas Vilniuje", "Telefonas 256 GB"];

const SELL_INTENTS = new Set([
  "sell_create",
  "sell_update",
  "sell_cancel",
  "sell_preview",
  "publish_request",
  "vin_candidate",
]);

function ctx(text: string): PlannerContextInput {
  return {
    messages: [{ role: "user", text }],
    lastUserText: text,
    hasDraft: false,
    isAuthenticated: true,
    hasSearchSession: false,
    modelAvailable: true,
  };
}

function requestFor(text: string, draft?: Record<string, unknown>): VautoAgentRequest {
  return {
    messages: [{ role: "user", text }],
    context: {
      userCity: "Vilnius",
      contact: "+37060000000",
      profilePhone: "+37060000000",
      isAuthenticated: true,
      fromSearchBar: true,
      ...(draft ? { listingDraft: draft } : {}),
    },
  };
}

describe("sell→search authority — heuristic level", () => {
  it("clear sell/create is SELL", () => {
    for (const c of SELL_CASES) {
      assert.equal(detectServerSellIntent(c), true, `sell: ${c}`);
    }
  });
  it("clear search/buy is NOT sell", () => {
    for (const c of SEARCH_CASES) {
      assert.equal(detectServerSellIntent(c), false, `search: ${c}`);
    }
  });
  it("negated sell/create is NOT sell", () => {
    for (const c of NEGATION_CASES) {
      assert.equal(detectServerSellIntent(c), false, `negation: ${c}`);
    }
  });
});

describe("sell→search authority — deterministic planner level", () => {
  it("clear sell/create plans a SELL intent (never catalog_search)", () => {
    for (const c of SELL_CASES) {
      const d = planTurn(ctx(c));
      assert.ok(SELL_INTENTS.has(d.intent), `sell intent for: ${c} (got ${d.intent})`);
      assert.notEqual(d.intent, "catalog_search", c);
    }
  });
  it("clear search/buy plans catalog_search", () => {
    for (const c of SEARCH_CASES) {
      const d = planTurn(ctx(c));
      assert.equal(d.intent, "catalog_search", c);
    }
  });
  it("advisory plans context_question (never SELL)", () => {
    for (const c of ADVISORY_CASES) {
      const d = planTurn(ctx(c));
      assert.ok(!SELL_INTENTS.has(d.intent), `advisory not sell: ${c} (got ${d.intent})`);
      assert.notEqual(d.intent, "catalog_search", c);
    }
  });
  it("negated sell/create plans a NON-sell intent", () => {
    for (const c of NEGATION_CASES) {
      const d = planTurn(ctx(c));
      assert.ok(!SELL_INTENTS.has(d.intent), `negation not sell: ${c} (got ${d.intent})`);
    }
  });
});

describe("sell→search authority — route/tool level (fromSearchBar=true)", () => {
  async function runWithStubs(text: string) {
    setPlannerDecisionProviderForTests(async (input) => planTurn(input));
    const recorder = createScriptedModelProvider({
      turns: [[round(textPart("Atsakymas"))]],
      exhausted: { parts: [] },
    });
    const prev = recorder.install();
    process.env.GEMINI_API_KEY = "sell-search-test-key";
    try {
      return await runVautoAgent(requestFor(text));
    } finally {
      recorder.restore();
      if (prev) globalThis.fetch = prev;
    }
  }

  it("clear sell/create never executes searchListings", async () => {
    for (const c of SELL_CASES) {
      const res = await runWithStubs(c);
      const tools = res.toolCalls.map((t) => t.name);
      assert.ok(!tools.includes("searchListings"), `no search for: ${c}`);
      assert.notEqual(res.actions.type, "search", c);
      assert.notEqual(res.actions.type, "empty_search", c);
    }
  });

  it("clear search/buy executes searchListings", async () => {
    for (const c of SEARCH_CASES) {
      const res = await runWithStubs(c);
      const tools = res.toolCalls.map((t) => t.name);
      assert.ok(tools.includes("searchListings"), `search for: ${c}`);
    }
  });
});

describe("sell→search authority — adversarial planner matrix", () => {
  function adapter(decision: Record<string, unknown>): PlannerLlmAdapter {
    return {
      providerId: "scripted-planner",
      async planStructured(_req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
        return { args: decision, provider: "scripted-planner", model: "sp-1" };
      },
    };
  }

  const CATALOG_SEARCH = { intent: "catalog_search", goal: "search", continuationOf: "none", action: "catalog_search", tool: "searchListings", toolArgs: { query: "x" }, needsClarification: false, confidence: 0.95, reasons: ["model_guess"] };
  const CONTEXT_Q = { intent: "context_question", goal: "answer a question", continuationOf: "none", action: "dialog_reply", tool: null, toolArgs: {}, needsClarification: false, confidence: 0.8, reasons: ["question"] };
  const CLARIFY = { intent: "clarify_ambiguous", goal: "disambiguate", continuationOf: "none", action: "clarify_buy_or_sell", tool: null, toolArgs: {}, needsClarification: true, clarificationQuestion: "?", confidence: 0.8, reasons: ["ambiguous"] };

  async function runWithPlanner(text: string, decision: Record<string, unknown>): Promise<string[]> {
    setPlannerAdapterForTests(adapter(decision));
    const recorder = createScriptedModelProvider({
      turns: [[round(textPart("Atsakymas"))]],
      exhausted: { parts: [] },
    });
    const prev = recorder.install();
    process.env.GEMINI_API_KEY = "sell-search-test-key";
    try {
      const res = await runVautoAgent(requestFor(text));
      return res.toolCalls.map((t) => t.name);
    } finally {
      recorder.restore();
      if (prev) globalThis.fetch = prev;
      setPlannerAdapterForTests(null);
    }
  }

  it("explicit directive survives a mistaken non-search planner decision", async () => {
    for (const text of [
      "Surask Kia Sportage iki 20000",
      "Gal gali parodyti butus Vilniuje?",
      "Surask naudotą iPhone iki 500",
    ]) {
      for (const decision of [CONTEXT_Q, CLARIFY]) {
        const tools = await runWithPlanner(text, decision);
        assert.ok(tools.includes("searchListings"), `directive must search: ${text} (${decision.intent})`);
      }
    }
  });

  it("compact browse defers to a non-search semantic goal", async () => {
    for (const decision of [CONTEXT_Q, CLARIFY]) {
      const tools = await runWithPlanner("Kia Sportage iki 20000", decision);
      assert.ok(!tools.includes("searchListings"), `browse must defer: ${decision.intent}`);
    }
  });

  it("advisory never searches even when the planner says catalog_search", async () => {
    const tools = await runWithPlanner("Ar verta ieškoti Kia Sportage?", CATALOG_SEARCH);
    assert.ok(!tools.includes("searchListings"), "advisory discovery guard owns the turn");
  });

  it("sell never searches even when the planner says catalog_search", async () => {
    const tools = await runWithPlanner("Noriu įdėti buto skelbimą", CATALOG_SEARCH);
    assert.ok(!tools.includes("searchListings"), "sell authority owns the turn");
  });
});
