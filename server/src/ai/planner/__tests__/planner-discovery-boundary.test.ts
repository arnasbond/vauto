/**
 * E2.8 — GENERALIZED DISCOVERY vs EXECUTION AUTHORITY boundary.
 *
 * FACETS != EXECUTION AUTHORITY · MODEL INTENT != EXECUTION AUTHORITY ·
 * FROMSEARCHBAR != EXECUTION AUTHORITY.
 *
 * Every turn converges to one authority class:
 *   EXECUTION (explicit directive)  → catalog_search
 *   DISCOVERY/ADVISORY             → context_question + advisoryContext
 *   BARE BROWSE                    → catalog_search (compact facets)
 *   WANTED                         → wanted_registration
 *   TRUE AMBIGUITY                 → clarify_ambiguous
 *
 * The full 28-item corpus + paraphrases. Semantic classes, not a phrase
 * dictionary: interrogative/uncertainty form + directive precedence.
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
import {
  isExplicitExecutionDirective,
  isExplicitWantedRequest,
  isNonExecutionDiscovery,
} from "../planner-signals.js";
import { planTurn } from "../planner-engine.js";

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
          toolArgs: { query: "x" },
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

const ADVISORY_CORPUS = [
  "Turiu apie 20 tūkst. eurų šeimos automobiliui, bet visiškai nežinau, ką rinktis. Nuo ko pradėtum?",
  "Nežinau ką rinktis. Nuo ko pradėtum?",
  "Padėk išsirinkti šeimos automobilį iki 20000.",
  "Ką rekomenduotum šeimai iki 20000?",
  "Ką pats rinktumeisi už 20000?",
  "Kas geriau šeimai: SUV ar universalas?",
  "Kokį automobilį patartum?",
  "Ar verta pirkti hibridą?",
  "Toyota RAV4 ar Honda CR-V — ką rinktumeisi?",
  "Ieškau patarimo dėl šeimos automobilio.",
  "Noriu suprasti, kas man labiausiai tiktų.",
  "Ką manai apie Kia Sportage iki 20000?",
  "Ar verta ieškoti Kia Sportage iki 20000?",
  "nežinau ką rinktis. nuo ko pradėtum?", // casing
  "NEŽINAU, KĄ RINKTIS — NUO KO PRADĖTI?", // casing + comma
];

const SEARCH_CORPUS = [
  "Surask Kia Sportage iki 20000.",
  "Parodyk Kia Sportage iki 20000.",
  "Rask šeimos automobilius iki 20000.",
  "Ieškok Toyota RAV4.",
  "Parodyk, kas yra iki 20000.",
  "Gal gali surasti Kia Sportage iki 20000?",
  "Ar gali parodyti Toyota RAV4?",
  "surask kia sportage iki 20000", // casing
  "Gal gali SURASTI Kia Sportage iki 20000?",
];

const WANTED_CORPUS = [
  "Pranešk, kai atsiras Kia Sportage iki 20000.",
  "Stebėk Kia Sportage ir pranešk, kai atsiras.",
  "Noriu gauti pranešimą, kai atsiras Toyota RAV4.",
];

const AMBIGUOUS_CORPUS = ["iPhone", "BMW", "butas"];

const BROWSE_CORPUS = [
  "automobiliai iki 20000",
  "Kia Sportage iki 20000",
  "butai Vilniuje iki 150000",
];

describe("E2.8 — discovery/execution authority corpus (LLM search-happy path)", () => {
  for (const phrase of ADVISORY_CORPUS) {
    it(`ADVISORY — „${phrase.slice(0, 46)}…“ never executes`, async () => {
      assert.equal(isNonExecutionDiscovery(phrase), true, "discovery class");
      assert.equal(isExplicitExecutionDirective(phrase), false);
      setPlannerAdapterForTests(searchHappyAdapter());
      const d = await resolvePlannerDecision(ctx(phrase));
      assert.equal(d.intent, "context_question", phrase);
      assert.equal(d.routing, "model");
      assert.equal(d.advisoryContext, true);
      assert.equal(d.tool, null);
    });
  }

  for (const phrase of SEARCH_CORPUS) {
    it(`SEARCH — „${phrase.slice(0, 46)}…“ executes`, async () => {
      assert.equal(isNonExecutionDiscovery(phrase), false, "not discovery");
      assert.equal(isExplicitExecutionDirective(phrase), true, "execution directive");
      setPlannerAdapterForTests(searchHappyAdapter());
      const d = await resolvePlannerDecision(ctx(phrase));
      assert.equal(d.intent, "catalog_search", phrase);
      assert.equal(d.tool, "searchListings");
      assert.notEqual(d.advisoryContext, true);
    });
  }

  for (const phrase of WANTED_CORPUS) {
    it(`WANTED — „${phrase.slice(0, 46)}…“ registers`, async () => {
      assert.equal(isExplicitWantedRequest(phrase), true);
      setPlannerAdapterForTests(searchHappyAdapter());
      const d = await resolvePlannerDecision(ctx(phrase));
      assert.equal(d.intent, "wanted_registration", phrase);
      assert.equal(d.routing, "deterministic_executor");
    });
  }

  for (const phrase of AMBIGUOUS_CORPUS) {
    it(`AMBIGUITY — „${phrase}“ clarifies`, async () => {
      setPlannerAdapterForTests(searchHappyAdapter());
      const d = await resolvePlannerDecision(ctx(phrase));
      assert.equal(d.intent, "clarify_ambiguous", phrase);
    });
  }

  for (const phrase of BROWSE_CORPUS) {
    it(`BROWSE — „${phrase}“ stays a compact catalog search (LLM path)`, async () => {
      assert.equal(isNonExecutionDiscovery(phrase), false, "not discovery");
      assert.equal(isExplicitWantedRequest(phrase), false);
      setPlannerAdapterForTests(searchHappyAdapter());
      const d = await resolvePlannerDecision(ctx(phrase));
      assert.equal(d.intent, "catalog_search", phrase);
    });
  }

  it("CONDITIONAL-WANTED — „Jei rasi Kia Sportage iki 20000, pranešk“ is NOT silently wanted (documented current support)", async () => {
    const phrase = "Jei rasi Kia Sportage iki 20000, pranešk.";
    assert.equal(isExplicitWantedRequest(phrase), false, "conditional-wanted form is not yet a wanted class");
    assert.equal(isNonExecutionDiscovery(phrase), false);
    setPlannerAdapterForTests(searchHappyAdapter());
    const d = await resolvePlannerDecision(ctx(phrase));
    assert.equal(d.intent, "catalog_search", "current documented behavior: falls through to the ordinary catalog path");
  });
});

describe("E2.8 — deterministic fallback engine mirrors the discovery boundary", () => {
  it("production discovery sentence → context_question + advisoryContext", () => {
    const d = planTurn(
      ctx(
        "Turiu apie 20 tūkst. eurų šeimos automobiliui, bet visiškai nežinau, ką rinktis. Nuo ko pradėtum?"
      )
    );
    assert.equal(d.intent, "context_question");
    assert.equal(d.routing, "model");
    assert.equal(d.advisoryContext, true);
  });

  it("polite-modality directive executes in the fallback too", () => {
    const d = planTurn(ctx("Ar gali parodyti Toyota RAV4?"));
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.routing, "deterministic_search");
  });

  it("meta assistant question stays dialog (not discovery-advisory)", () => {
    const d = planTurn(ctx("Ką tu gali?"));
    assert.notEqual(d.intent, "context_question");
    assert.equal(d.intent, "dialog");
  });

  it("„Ar verta ieškoti Kia Sportage?“ stays advisory in the fallback", () => {
    const d = planTurn(ctx("Ar verta ieškoti Kia Sportage iki 20000?"));
    assert.equal(d.intent, "context_question");
    assert.equal(d.advisoryContext, true);
  });
});
