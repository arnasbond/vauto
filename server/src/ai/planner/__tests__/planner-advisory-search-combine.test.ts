/**
 * R2-H1 — ADVISORY + SEARCH are not mutually exclusive.
 *
 * Production blocker: an advisory buying question was either (a) reduced to a
 * bare catalog search when it also carried a search verb, or (b) refused as
 * out-of-domain. Search is a TOOL, not the mandatory meaning of a buying
 * question. These tests lock in the semantic class:
 *   - pure advisory         → context_question + advisoryContext (no mandatory search)
 *   - mixed search+advisory → catalog_search + advisoryContext (advise AND retrieve)
 *   - pure search           → catalog_search (no advisoryContext)
 * plus the prompt-level invariants (advice is in-domain; buyer turns get no
 * business-partner seller context).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  resolvePlannerDecision,
  setPlannerAdapterForTests,
  setPlannerDecisionProviderForTests,
} from "../planner-orchestrator.js";
import type {
  PlannerLlmAdapter,
  PlannerStructuredRequest,
  PlannerStructuredResponse,
} from "../planner-provider.js";
import type { PlannerContextInput } from "../planner-types.js";
import { isAdvisorySignal } from "../planner-signals.js";
import { VAUTO_DOMAIN_AUTONOMY_RULES } from "../../../shared/vauto-domain-autonomy.js";
import { GEMINI_BUSINESS_PARTNER_RULES } from "../../gemini-intent-rules.js";
import { ADVISORY_SAFE_TOOL_NAMES } from "../../vauto-agent.js";

afterEach(() => {
  setPlannerAdapterForTests(null);
  setPlannerDecisionProviderForTests(null);
});

function searchHappyAdapter(): PlannerLlmAdapter {
  return {
    providerId: "fake-search-happy",
    async planStructured(_req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
      return {
        args: {
          intent: "catalog_search",
          goal: "search",
          continuationOf: "none",
          action: "catalog_search",
          tool: "searchListings",
          toolArgs: { query: "skalbimo mašina" },
          needsClarification: false,
          confidence: 0.95,
          reasons: ["facets"],
        },
        provider: "fake-search-happy",
        model: "sh-1",
      };
    },
  };
}

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

describe("R2-H1 — isAdvisorySignal (advisory independent of search verb)", () => {
  it("is TRUE for a mixed search + advice utterance", () => {
    assert.equal(isAdvisorySignal("Ieškau skalbimo mašinos iki 400 eurų, ką rekomenduotum?"), true);
    assert.equal(isAdvisorySignal("Ieškau BMW iki 10k, ką patartum?"), true);
  });

  it("is TRUE for pure advisory (no search verb)", () => {
    assert.equal(isAdvisorySignal("Nežinau kokį automobilį rinktis. Ką patartum?"), true);
  });

  it("is FALSE for a pure search/directive", () => {
    assert.equal(isAdvisorySignal("Surask Kia Sportage iki 20000."), false);
    assert.equal(isAdvisorySignal("Ieškau skalbimo mašinos iki 400 eurų."), false);
  });
});

describe("R2-H1.2 — descriptive 'ieškau' + advisory reaches reasoning", () => {
  it("mixed descriptive search + advisory becomes context_question (advisory owns the turn)", async () => {
    // 'ieškau' is descriptive, not an execution directive: with an advisory
    // marker the planner resolves to context_question + advisoryContext. The
    // model may still retrieve (searchListings is advisory-safe) to inform its
    // advice, but the turn is NOT hard-routed to catalog execution.
    const phrase = "Ieškau skalbimo mašinos iki 400 eurų, ką rekomenduotum?";
    setPlannerAdapterForTests(searchHappyAdapter());
    const d = await resolvePlannerDecision(ctx(phrase));
    assert.equal(d.intent, "context_question", "advisory wins over descriptive search language");
    assert.equal(d.advisoryContext, true, "advice dimension is preserved");
  });

  it("pure advisory still becomes context_question (no mandatory search)", async () => {
    const phrase = "Nežinau kokį automobilį rinktis. Ką patartum?";
    setPlannerAdapterForTests(searchHappyAdapter());
    const d = await resolvePlannerDecision(ctx(phrase));
    assert.equal(d.intent, "context_question", phrase);
    assert.equal(d.tool, null);
    assert.equal(d.advisoryContext, true);
  });

  it("pure descriptive search (no advisory word) stays catalog_search WITHOUT advisoryContext", async () => {
    const phrase = "Ieškau skalbimo mašinos iki 400 eurų.";
    setPlannerAdapterForTests(searchHappyAdapter());
    const d = await resolvePlannerDecision(ctx(phrase));
    assert.equal(d.intent, "catalog_search", phrase);
    assert.notEqual(d.advisoryContext, true);
  });
});

describe("R2-H1 — capability/prompt invariants", () => {
  it("searchListings is advisory-safe (search is a read tool)", () => {
    assert.equal(ADVISORY_SAFE_TOOL_NAMES.has("searchListings"), true);
  });

  it("domain autonomy rules treat buying advice as IN-DOMAIN", () => {
    assert.match(VAUTO_DOMAIN_AUTONOMY_RULES, /PATARIMAI|REKOMENDACIJOS/i);
    assert.match(VAUTO_DOMAIN_AUTONOMY_RULES, /IN-DOMAIN/i);
    assert.match(VAUTO_DOMAIN_AUTONOMY_RULES, /neatsisakyk/i);
  });

  it("business-partner rules do NOT apply to buyer advisory turns", () => {
    assert.match(GEMINI_BUSINESS_PARTNER_RULES, /PIRKIMO patarimo/i);
    assert.match(GEMINI_BUSINESS_PARTNER_RULES, /NE verslo partneris/i);
  });
});
