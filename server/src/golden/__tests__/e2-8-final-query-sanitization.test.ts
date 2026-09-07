/**
 * E2.8 FINAL — query control-language sanitization regression.
 *
 * Execution/control verbs (directive imperative + infinitive + polite
 * modals) must never become catalog subject matter in freeTextKeywords,
 * filters.query, zero-result displayQuery, or the user-facing subject label.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { InMemoryThreadStore } from "../../agent-core/thread-store.js";
import { setThreadStoreForTests } from "../../agent-core/thread-store-instance.js";
import { optionalAuth } from "../../middleware/auth.js";
import { vautoAgentRouter } from "../../routes/vauto-agent.js";
import { setPlannerAdapterForTests } from "../../ai/planner/planner-orchestrator.js";
import type { PlannerLlmAdapter, PlannerStructuredRequest, PlannerStructuredResponse } from "../../ai/planner/planner-provider.js";
import { resolveUniversalSearchQuery } from "../../ai/search/universal-search-query.js";
import { normalizeProductSearchQuery } from "../../ai/product-search-query.js";
import { createScriptedModelProvider, round, text } from "../harness/scripted-model-provider.js";
import { parseLiveStreamBody } from "../harness/live-stream-parser.js";

afterEach(() => {
  setThreadStoreForTests(null);
  setPlannerAdapterForTests(null);
  delete process.env.GEMINI_API_KEY;
});

function createApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api/vauto-agent", vautoAgentRouter);
  return app;
}

function llmPlannerAdapter(decision: Record<string, unknown>): PlannerLlmAdapter {
  return {
    providerId: "scripted-planner",
    async planStructured(_req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
      return { args: decision, provider: "scripted-planner", model: "sp-1" };
    },
  };
}

const LLM_SEARCH = { intent: "catalog_search", goal: "search", continuationOf: "none", action: "catalog_search", tool: "searchListings", toolArgs: { query: "x" }, needsClarification: false, confidence: 0.95, reasons: ["model_guess"] };

async function run(userText: string) {
  setThreadStoreForTests(new InMemoryThreadStore());
  setPlannerAdapterForTests(llmPlannerAdapter(LLM_SEARCH));
  const recorder = createScriptedModelProvider({ turns: [[round(text("nevyksta"))]], exhausted: { parts: [] } });
  const prev = recorder.install();
  process.env.GEMINI_API_KEY = "e28-final-key";
  const app = createApp();
  try {
    const res = await request(app).post("/api/vauto-agent/stream").send({
      turnId: "q-" + Math.random().toString(36).slice(2, 8),
      messages: [{ role: "user", text: userText }],
      context: { isAuthenticated: true, userCity: "Vilnius", fromSearchBar: true },
    });
    return parseLiveStreamBody(String(res.text ?? ""));
  } finally {
    recorder.restore();
    if (prev) globalThis.fetch = prev;
  }
}

const CONTROL_TOKENS = /parodyti|parodyk|surasti|surask|rasti|ieškoti|ieškok|paieškoti|paieškok|atrasti|atrask|galėtumėt|galėtumėte|galite|galėtų|galėčiau|galetumet/i;

describe("E2.8 FINAL — query control-language sanitization", () => {
  it("freeTextKeywords exclude control language for polite-directive infinitives", () => {
    const { query } = resolveUniversalSearchQuery("Galėtumėt parodyti butus Vilniuje?");
    assert.equal(query.canonicalCategory, "real_estate");
    assert.equal(query.location, "Vilnius");
    assert.deepEqual(query.freeTextKeywords, ["butus"]);
    assert.ok(!query.freeTextKeywords.some((k) => CONTROL_TOKENS.test(k)));
  });

  it("freeTextKeywords exclude control language for polite modals", () => {
    for (const q of [
      "Gal galite surasti butus Vilniuje?",
      "Galėčiau rasti automobilį iki 20000",
      "Galėtų parodyti butus Vilniuje",
    ]) {
      const { query } = resolveUniversalSearchQuery(q);
      assert.ok(!query.freeTextKeywords.some((k) => CONTROL_TOKENS.test(k)), q);
    }
  });

  it("normalizeProductSearchQuery never exposes control verbs", () => {
    const out = normalizeProductSearchQuery("Galėtumėt parodyti butus Vilniuje?");
    assert.ok(!CONTROL_TOKENS.test(out), `got ${out}`);
  });

  it("genuine product/domain terms are preserved", () => {
    const { query } = resolveUniversalSearchQuery("Surask Kia Sportage iki 20000 eurų");
    assert.deepEqual(query.freeTextKeywords, ["kia", "sportage"]);
    assert.equal(normalizeProductSearchQuery("Ieškau Toyota RAV4"), "Toyota Rav4");
  });

  it("imperative directive still executes and preserves product terms", () => {
    const { query } = resolveUniversalSearchQuery("Parodyk man Volvo iki 15000");
    assert.deepEqual(query.freeTextKeywords, ["volvo"]);
    assert.equal(query.priceMax, 15000);
  });

  it("ROUTE — polite directive executes search with no control token in action/filters/label", async () => {
    const s = await run("Galėtumėt parodyti butus Vilniuje?");
    const tools = s.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(tools.includes("searchListings"), "search executes");
    const actions = s.finalResult!.actions as Record<string, unknown> & {
      searchQuery?: string;
      filters?: { query?: string };
    };
    assert.ok(!CONTROL_TOKENS.test(actions.searchQuery ?? ""), `searchQuery: ${actions.searchQuery}`);
    assert.ok(!CONTROL_TOKENS.test(actions.filters?.query ?? ""), `filters.query: ${actions.filters?.query}`);
    assert.ok(!CONTROL_TOKENS.test(s.finalResult!.reply ?? ""), `reply: ${s.finalResult!.reply}`);
  });

  it("ROUTE — Gal galite surasti butus Vilniuje? executes with clean query", async () => {
    const s = await run("Gal galite surasti butus Vilniuje?");
    const tools = s.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(tools.includes("searchListings"));
    const actions = s.finalResult!.actions as Record<string, unknown> & { searchQuery?: string };
    assert.ok(!CONTROL_TOKENS.test(actions.searchQuery ?? ""));
  });
});
