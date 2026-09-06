/**
 * E2.8 — FIRST-CLASS EXPLICIT WANTED intent (watch / notify-when-available).
 *
 * The wanted semantic class is a DETERMINISTIC POLICY BOUNDARY, exactly like
 * advisory: regardless of the LLM planner's intent (catalog_search / dialog /
 * context_question / clarify_ambiguous), an explicit wanted utterance must
 * converge to `wanted_registration` (deterministic executor →
 * createUserRequirement capability). No searchListings, no model lottery.
 *
 * All phrases here are semantic-class variants, NOT the production sentence.
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
import { isExplicitWantedRequest } from "../planner-signals.js";
import { planTurn } from "../planner-engine.js";

afterEach(() => {
  setPlannerAdapterForTests(null);
  setPlannerDecisionProviderForTests(null);
});

function adapter(decision: Record<string, unknown>): PlannerLlmAdapter {
  return {
    providerId: "fake-wanted",
    async planStructured(_req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
      return { args: decision, provider: "fake-wanted", model: "w-1" };
    },
  };
}

const CATALOG_SEARCH = {
  intent: "catalog_search",
  goal: "search the catalog",
  continuationOf: "none",
  action: "catalog_search",
  tool: "searchListings",
  toolArgs: { query: "kia sportage" },
  needsClarification: false,
  confidence: 0.95,
  reasons: ["model_guess"],
};

const DIALOG = {
  intent: "dialog",
  goal: "chat",
  continuationOf: "none",
  action: "dialog_reply",
  tool: null,
  toolArgs: {},
  needsClarification: false,
  confidence: 0.7,
  reasons: ["model_guess"],
};

const CONTEXT_QUESTION = {
  intent: "context_question",
  goal: "answer a question",
  continuationOf: "none",
  action: "dialog_reply",
  tool: null,
  toolArgs: {},
  needsClarification: false,
  confidence: 0.8,
  reasons: ["question"],
};

const CLARIFY = {
  intent: "clarify_ambiguous",
  goal: "disambiguate",
  continuationOf: "none",
  action: "clarify_buy_or_sell",
  tool: null,
  toolArgs: {},
  needsClarification: true,
  clarificationQuestion: "pirkti ar parduoti?",
  confidence: 0.9,
  reasons: ["ambiguous"],
};

function ctx(text: string, extra: Partial<PlannerContextInput> = {}): PlannerContextInput {
  return {
    messages: [{ role: "user", text }],
    lastUserText: text,
    hasDraft: false,
    isAuthenticated: true,
    hasSearchSession: false,
    modelAvailable: true,
    ...extra,
  };
}

describe("E2.8 — isExplicitWantedRequest semantic class", () => {
  const WANTED = [
    "Pranešk, kai atsiras Kia Sportage iki 20000 eurų",
    "Kai atsiras Kia Sportage iki 20000 eurų, pranešk man",
    "Noriu gauti pranešimą, kai atsiras Kia Sportage",
    "Stebėk Kia Sportage ir informuok, kai atsiras",
    "Pranešk, kai atsiras automobilis iki 20000",
    "Informuokite, kai atsiras Volvo V70 iki 15000",
  ];
  for (const phrase of WANTED) {
    it(`„${phrase.slice(0, 52)}…“ is an explicit wanted request`, () => {
      assert.equal(isExplicitWantedRequest(phrase), true, phrase);
    });
  }

  const NOT_WANTED = [
    "Pranešk, kai baigsi redaguoti skelbimą",
    "Pranešk pardavėjui, kad atvažiuosiu rytoj",
    "Pranešk, kai atsiras mano skelbimas",
    "Surask Kia Sportage iki 20000",
    "Nežinau ko noriu, bet reikia šeimai patikimo automobilio iki 20 tūkst. eurų, ką siūlytum?",
    "iPhone",
    "automobiliai iki 20000",
  ];
  for (const phrase of NOT_WANTED) {
    it(`„${phrase.slice(0, 52)}…“ is NOT an explicit wanted request`, () => {
      assert.equal(isExplicitWantedRequest(phrase), false, phrase);
    });
  }
});

describe("E2.8 — wanted_registration is a deterministic policy boundary (totality)", () => {
  const WANTED = "Pranešk, kai atsiras Kia Sportage iki 20000 eurų";

  function assertWanted(d: Awaited<ReturnType<typeof resolvePlannerDecision>>) {
    assert.equal(d.intent, "wanted_registration");
    assert.equal(d.routing, "deterministic_executor");
    assert.equal(d.action, "create_user_requirement");
    assert.equal(d.tool, null);
    assert.ok((d.reasons ?? []).includes("explicit_wanted_request"));
  }

  it("CASE W7 — every LLM intent converges to wanted_registration", async () => {
    for (const decision of [CATALOG_SEARCH, DIALOG, CONTEXT_QUESTION, CLARIFY]) {
      setPlannerAdapterForTests(adapter(decision));
      const d = await resolvePlannerDecision(ctx(WANTED));
      assertWanted(d);
    }
  });

  it("high-confidence catalog_search CANNOT defeat the wanted class", async () => {
    setPlannerAdapterForTests(
      adapter({ ...CATALOG_SEARCH, confidence: 0.95, toolArgs: { query: "kia sportage iki 20000" } })
    );
    const d = await resolvePlannerDecision(ctx(WANTED));
    assertWanted(d);
  });

  it("deterministic fallback engine produces wanted_registration", () => {
    const d = planTurn(ctx(WANTED, { modelAvailable: false }));
    assert.equal(d.intent, "wanted_registration");
    assert.equal(d.routing, "deterministic_executor");
  });

  it("CASE W8 — explicit search is NOT wanted", async () => {
    setPlannerAdapterForTests(adapter(CATALOG_SEARCH));
    const d = await resolvePlannerDecision(ctx("Surask Kia Sportage iki 20000"));
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.tool, "searchListings");
  });

  it("CASE W9 — advisory is NOT wanted (stays context_question + advisoryContext)", async () => {
    const advisory =
      "Nežinau ko noriu, bet reikia šeimai patikimo automobilio iki 20000, ką siūlytum?";
    for (const decision of [CATALOG_SEARCH, DIALOG, CONTEXT_QUESTION, CLARIFY]) {
      setPlannerAdapterForTests(adapter(decision));
      const d = await resolvePlannerDecision(ctx(advisory));
      assert.equal(d.intent, "context_question", String(decision.intent));
      assert.equal(d.advisoryContext, true);
    }
  });

  it("CASE W10 — true bare-noun ambiguity is preserved (iPhone)", async () => {
    setPlannerAdapterForTests(adapter(CATALOG_SEARCH));
    const d = await resolvePlannerDecision(ctx("iPhone"));
    assert.equal(d.intent, "clarify_ambiguous");
  });

  it("CASE W11/W12 — false positives never become wanted_registration", async () => {
    for (const phrase of [
      "Pranešk, kai baigsi redaguoti skelbimą",
      "Pranešk pardavėjui, kad atvažiuosiu rytoj",
    ]) {
      setPlannerAdapterForTests(adapter(CATALOG_SEARCH));
      const d = await resolvePlannerDecision(ctx(phrase));
      assert.notEqual(d.intent, "wanted_registration", phrase);
    }
  });
});
