/**
 * E2.8 FINAL SEMANTIC HARDENING — positive search-authority + Unicode
 * boundary + polite modal + English wanted regression matrix.
 *
 * Proves the fromSearchBar fast-path is POSITIVE ALLOW (explicit directive
 * or compact/bare browse), never "everything else = search", and that the
 * discovery/advisory/interrogative classes survive diacritic boundaries.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import request from "supertest";

import { InMemoryThreadStore } from "../../agent-core/thread-store.js";
import { setThreadStoreForTests } from "../../agent-core/thread-store-instance.js";
import { optionalAuth } from "../../middleware/auth.js";
import { vautoAgentRouter } from "../../routes/vauto-agent.js";
import { planTurn } from "../../ai/planner/planner-engine.js";
import {
  setPlannerAdapterForTests,
  setPlannerDecisionProviderForTests,
} from "../../ai/planner/planner-orchestrator.js";
import type {
  PlannerLlmAdapter,
  PlannerStructuredRequest,
  PlannerStructuredResponse,
} from "../../ai/planner/planner-provider.js";
import {
  isExplicitExecutionDirective,
  isExplicitWantedRequest,
  isNonExecutionDiscovery,
  isCompactCatalogBrowse,
} from "../../ai/planner/planner-signals.js";
import {
  createScriptedModelProvider,
  fc,
  round,
  text,
} from "../harness/scripted-model-provider.js";
import { parseLiveStreamBody } from "../harness/live-stream-parser.js";

afterEach(() => {
  setThreadStoreForTests(null);
  setPlannerDecisionProviderForTests(null);
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

const LLM_SEARCH_DECISION = {
  intent: "catalog_search",
  goal: "search",
  continuationOf: "none",
  action: "catalog_search",
  tool: "searchListings",
  toolArgs: { query: "x" },
  needsClarification: false,
  confidence: 0.95,
  reasons: ["model_guess"],
};

const LLM_DIALOG_DECISION = {
  intent: "dialog",
  goal: "chat",
  continuationOf: "none",
  action: "dialog_reply",
  tool: null,
  toolArgs: {},
  needsClarification: false,
  confidence: 0.7,
  reasons: ["chat"],
};

async function runRoute(userText: string, plannerDecision: Record<string, unknown>) {
  setThreadStoreForTests(new InMemoryThreadStore());
  setPlannerAdapterForTests(llmPlannerAdapter(plannerDecision));
  const recorder = createScriptedModelProvider({
    turns: [[round(text("atsakymas"))]],
    exhausted: { parts: [] },
  });
  const prev = recorder.install();
  process.env.GEMINI_API_KEY = "e28-final-key";
  const app = createApp();
  try {
    const res = await request(app)
      .post("/api/vauto-agent/stream")
      .send({
        turnId: "e28f-" + Math.random().toString(36).slice(2, 8),
        messages: [{ role: "user", text: userText }],
        context: { isAuthenticated: true, userCity: "Vilnius", fromSearchBar: true },
      });
    return parseLiveStreamBody(String(res.text ?? ""));
  } finally {
    recorder.restore();
    if (prev) globalThis.fetch = prev;
  }
}

describe("E2.8 FINAL — positive search-authority signals", () => {
  it("META/DIALOG questions are never search-authorized by fromSearchBar signals", () => {
    for (const q of ["Ką tu gali?", "Kas tu esi?", "Kaip veikia VAUTO?", "Padėk man suprasti, ką čia galima daryti"]) {
      assert.equal(isExplicitExecutionDirective(q), false, `not directive: ${q}`);
      assert.equal(isCompactCatalogBrowse(q), false, `not browse: ${q}`);
    }
  });

  it("DISCOVERY/advisory is recognized across diacritic boundaries", () => {
    for (const q of [
      "Nežinau, ką rinktis.",
      "Nežinau kokį automobilį rinktis",
      "Nežinau kurią markę rinktis",
      "Ką manai apie Kia Sportage?",
    ]) {
      assert.equal(isNonExecutionDiscovery(q), true, `discovery: ${q}`);
      assert.equal(isExplicitExecutionDirective(q), false, `not directive: ${q}`);
    }
  });

  it("polite modal „galėtumėt“ is an explicit execution directive", () => {
    assert.equal(isExplicitExecutionDirective("Galėtumėt parodyti butus Vilniuje?"), true);
    assert.equal(isExplicitExecutionDirective("Gal gali surasti Kia Sportage?"), true);
  });

  it("meta-search question „Ar verta ieškoti…“ stays advisory, not execution", () => {
    assert.equal(isExplicitExecutionDirective("Ar verta ieškoti Kia Sportage iki 20000?"), false);
    assert.equal(isNonExecutionDiscovery("Ar verta ieškoti Kia Sportage iki 20000?"), true);
  });

  it("English wanted „Notify me when … appears“ is a wanted request", () => {
    assert.equal(isExplicitWantedRequest("Notify me when Kia Sportage appears"), true);
    assert.equal(isExplicitWantedRequest("Notify me when a Kia Sportage under 20000 appears"), true);
  });

  it("generic notify without catalog target is NOT wanted", () => {
    assert.equal(isExplicitWantedRequest("Notify me when you are done"), false);
  });

  it("compact/bare browse is positively search-authorized by facets", () => {
    assert.equal(isCompactCatalogBrowse("Kia Sportage iki 20000"), true);
    assert.equal(isCompactCatalogBrowse("butai Vilniuje iki 150000"), true);
    assert.equal(isCompactCatalogBrowse("automobiliai iki 20000"), true);
  });
});

describe("E2.8 FINAL — positive search-authority route boundary (fromSearchBar=true)", () => {
  it("META/DIALOG questions never execute searchListings (even with a search-happy planner)", async () => {
    for (const q of ["Ką tu gali?", "Kas tu esi?", "Kaip veikia VAUTO?"]) {
      const stream = await runRoute(q, LLM_SEARCH_DECISION);
      const tools = stream.finalResult!.toolCalls.map((t) => t.name);
      assert.ok(!tools.includes("searchListings"), `no search for: ${q}`);
      assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none", q);
    }
  });

  it("DISCOVERY utterances never execute searchListings", async () => {
    for (const q of [
      "Nežinau, ką rinktis.",
      "Nežinau kokį automobilį rinktis",
      "Ką manai apie Kia Sportage?",
    ]) {
      const stream = await runRoute(q, LLM_SEARCH_DECISION);
      const tools = stream.finalResult!.toolCalls.map((t) => t.name);
      assert.ok(!tools.includes("searchListings"), `no search for: ${q}`);
      assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none", q);
    }
  });

  it("EXPLICIT SEARCH directives execute searchListings", async () => {
    for (const q of ["Surask Kia Sportage", "Gal gali surasti Kia Sportage?", "Galėtumėt parodyti butus Vilniuje?"]) {
      const stream = await runRoute(q, LLM_SEARCH_DECISION);
      const tools = stream.finalResult!.toolCalls.map((t) => t.name);
      assert.ok(tools.includes("searchListings"), `search for: ${q}`);
    }
  });

  it("BARE BROWSE stays a catalog search", async () => {
    for (const q of ["Kia Sportage iki 20000", "butai Vilniuje iki 150000"]) {
      const stream = await runRoute(q, LLM_SEARCH_DECISION);
      const tools = stream.finalResult!.toolCalls.map((t) => t.name);
      assert.ok(tools.includes("searchListings"), `search for: ${q}`);
    }
  });

  it("WANTED requests register without searchListings", async () => {
    for (const q of ["Pranešk, kai atsiras Kia Sportage", "Notify me when Kia Sportage appears"]) {
      const stream = await runRoute(q, LLM_SEARCH_DECISION);
      const tools = stream.finalResult!.toolCalls.map((t) => t.name);
      assert.ok(tools.includes("createUserRequirement"), `wanted for: ${q}`);
      assert.ok(!tools.includes("searchListings"), `no search for: ${q}`);
      assert.equal(
        (stream.finalResult!.actions as Record<string, unknown>).type,
        "create_user_requirement",
        q
      );
    }
  });

  it("TRUE AMBIGUITY keeps clarify_ambiguous", async () => {
    const stream = await runRoute("iPhone", LLM_SEARCH_DECISION);
    assert.match(stream.finalResult!.reply, /pirkti ar parduoti/i);
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
  });
});

describe("E2.8 FINAL — deterministic planner mirrors the positive-authority boundary", () => {
  it("meta/dialog questions stay dialog in the fallback planner", () => {
    for (const q of ["Ką tu gali?", "Kas tu esi?", "Kaip veikia VAUTO?"]) {
      const d = planTurn({
        messages: [{ role: "user", text: q }],
        lastUserText: q,
        hasDraft: false,
        isAuthenticated: true,
        hasSearchSession: false,
        modelAvailable: true,
      });
      assert.notEqual(d.intent, "catalog_search", `not search: ${q}`);
    }
  });

  it("diacritic discovery sentences stay context_question + advisoryContext", () => {
    for (const q of ["Nežinau kokį automobilį rinktis", "Nežinau kurią markę rinktis"]) {
      const d = planTurn({
        messages: [{ role: "user", text: q }],
        lastUserText: q,
        hasDraft: false,
        isAuthenticated: true,
        hasSearchSession: false,
        modelAvailable: true,
      });
      assert.equal(d.intent, "context_question", q);
      assert.equal(d.advisoryContext, true, q);
    }
  });

  it("polite modal „galėtumėt“ executes catalog_search in the fallback", () => {
    const d = planTurn({
      messages: [{ role: "user", text: "Galėtumėt parodyti butus Vilniuje?" }],
      lastUserText: "Galėtumėt parodyti butus Vilniuje?",
      hasDraft: false,
      isAuthenticated: true,
      hasSearchSession: false,
      modelAvailable: true,
    });
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.routing, "deterministic_search");
  });

  it("English wanted registers wanted_registration in the fallback", () => {
    const d = planTurn({
      messages: [{ role: "user", text: "Notify me when Kia Sportage appears" }],
      lastUserText: "Notify me when Kia Sportage appears",
      hasDraft: false,
      isAuthenticated: true,
      hasSearchSession: false,
      modelAvailable: true,
    });
    assert.equal(d.intent, "wanted_registration");
  });
});
