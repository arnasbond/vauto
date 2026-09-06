/**
 * E2.8 — ADVISORY/INTERROGATIVE anti-search boundary + facet provenance.
 *
 * Generalized across the semantic CLASS (advice verbs + indecision
 * phrases) and ALL verticals — never a phrase hardcode. The fake provider
 * mimics the observed live failure: a confident catalog_search decision
 * for a facet-carrying advisory utterance.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resolvePlannerDecision, setPlannerAdapterForTests, setPlannerDecisionProviderForTests } from "../planner-orchestrator.js";
import type { PlannerLlmAdapter, PlannerStructuredRequest, PlannerStructuredResponse } from "../planner-provider.js";
import type { PlannerContextInput } from "../planner-types.js";
import { groundBrandAttributesInUserText } from "../../agent-ui-tools.js";
import { isAdvisoryInterrogative } from "../planner-signals.js";
import { analyzeSearchIntent } from "../../search-intent.js";

afterEach(() => {
  setPlannerAdapterForTests(null);
  setPlannerDecisionProviderForTests(null);
});

function searchHappyAdapter(decision: Record<string, unknown>): PlannerLlmAdapter {
  return {
    providerId: "fake-search-happy",
    async planStructured(_req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
      return { args: decision, provider: "fake-search-happy", model: "sh-1" };
    },
  };
}

const CONFIDENT_SEARCH = {
  intent: "catalog_search",
  goal: "search the catalog",
  continuationOf: "none",
  action: "catalog_search",
  tool: "searchListings",
  toolArgs: { query: "automobilis" },
  needsClarification: false,
  confidence: 0.95,
  reasons: ["model_guess"],
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

describe("E2.8 — advisory/interrogative anti-search (facet-carrying, all verticals)", () => {
  const ADVISORY = [
    "nežinau ko noriu, bet reikia šeimai patikimo automobilio iki 20 tūkst. €, ką siūlytum?",
    "ką rekomenduotum — butą Vilniuje iki 120000 ar namą?",
    "padėk išsirinkti telefoną iki 500 eurų",
    "kokią sofą patartum iki 300 eurų?",
    "neturiu aiškaus noro, gal drabužių iki 50 eurų?",
    "ką siūlytum — dviratį ar paspirtuką Kaune?",
  ];
  for (const phrase of ADVISORY) {
    it(`„${phrase.slice(0, 48)}…“ with a confident search-happy model → context_question, NO searchListings`, async () => {
      setPlannerAdapterForTests(searchHappyAdapter(CONFIDENT_SEARCH));
      const d = await resolvePlannerDecision(ctx(phrase));
      assert.equal(d.intent, "context_question", phrase);
      assert.equal(d.tool, null, "no tool — advice answered in dialog text");
      assert.equal(d.routing, "model");
    });
  }

  it("negative control: explicit search keeps catalog_search (Kia Sportage iki 20000)", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(CONFIDENT_SEARCH));
    const d = await resolvePlannerDecision(ctx("Kia Sportage iki 20000"));
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.tool, "searchListings");
  });

  it("negative control: facet query without advice stays catalog_search (automobiliai iki 20000)", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(CONFIDENT_SEARCH));
    const d = await resolvePlannerDecision(ctx("automobiliai iki 20000"));
    assert.equal(d.intent, "catalog_search");
  });

  it("negative control: explicit search verb wins over advice words (surask, ką rekomenduotum, iki 20000)", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(CONFIDENT_SEARCH));
    const d = await resolvePlannerDecision(ctx("surask automobilį iki 20000"));
    assert.equal(d.intent, "catalog_search");
  });

  it("advisory never leads to empty-search wishlist: no search side effect tool, deterministic search NOT forced", async () => {
    const phrase = "ką siūlytum šeimai — automobilį iki 20000?";
    setPlannerAdapterForTests(searchHappyAdapter(CONFIDENT_SEARCH));
    const d = await resolvePlannerDecision(ctx(phrase));
    assert.equal(d.routing, "model", "never the deterministic search fast-path");
    assert.equal(d.tool, null);
  });

  it("signal class recognition is generalized (isAdvisoryInterrogative)", () => {
    assert.equal(isAdvisoryInterrogative("ką siūlytum?"), true);
    assert.equal(isAdvisoryInterrogative("padėk išsirinkti telefoną iki 500"), true);
    assert.equal(isAdvisoryInterrogative("nežinau ko noriu"), true);
    assert.equal(isAdvisoryInterrogative("Kia Sportage iki 20000"), false);
    assert.equal(isAdvisoryInterrogative("surask automobilį iki 20000"), false);
    assert.equal(isAdvisoryInterrogative("automobiliai iki 20000"), false);
  });
});

describe("E2.8 — facet PROVENANCE (model suggestion ≠ user constraint)", () => {
  it("model-invented brand/make/model attributes are dropped on text-only turns", () => {
    const out = groundBrandAttributesInUserText(
      { brand: "Kia", model: "Sportage", bodyType: "SUV" },
      "automobiliai iki 20000"
    );
    assert.equal(out?.brand, undefined, "invented brand dropped");
    assert.equal(out?.model, undefined, "invented model dropped");
    assert.equal(out?.bodyType, "SUV", "non-identity attributes pass");
  });

  it("user-provided brand/model stays grounded", () => {
    const out = groundBrandAttributesInUserText(
      { brand: "Kia", model: "Sportage" },
      "Kia Sportage iki 20000"
    );
    assert.equal(out?.brand, "Kia");
    assert.equal(out?.model, "Sportage");
  });

  it("empty attributes round-trip safely", () => {
    assert.equal(groundBrandAttributesInUserText(undefined, "x"), undefined);
    assert.equal(groundBrandAttributesInUserText({}, "x"), undefined);
    assert.equal(
      groundBrandAttributesInUserText({ brand: "Kia" }, "automobiliai")?.brand,
      undefined
    );
  });

  it("case-insensitive grounding (kia vs KIA)", () => {
    assert.equal(
      groundBrandAttributesInUserText({ brand: "kia" }, "KIA Sportage iki 20000")?.brand,
      "kia"
    );
  });

  it("Unicode/diacritics normalization (Škoda vs skoda)", () => {
    assert.equal(
      groundBrandAttributesInUserText({ brand: "Škoda" }, "skoda octavia iki 15000")?.brand,
      "Škoda"
    );
  });

  it("punctuation folding (ID.4 → id 4 token sequence)", () => {
    assert.equal(
      groundBrandAttributesInUserText({ model: "ID.4" }, "noriu id.4 iki 30000")?.model,
      "ID.4"
    );
    assert.equal(
      groundBrandAttributesInUserText({ model: "ID.4" }, "automobiliai iki 30000")?.model,
      undefined,
      "unstated ID.4 dropped"
    );
  });

  it("short tokens: MG/DS groundable; single-digit model NEVER grounds", () => {
    assert.equal(
      groundBrandAttributesInUserText({ brand: "MG" }, "MG automobilis iki 20000")?.brand,
      "MG"
    );
    assert.equal(
      groundBrandAttributesInUserText({ brand: "DS" }, "automobiliai iki 20000")?.brand,
      undefined
    );
    assert.equal(
      groundBrandAttributesInUserText({ model: "3" }, "iki 3000 eurų")?.model,
      undefined,
      "a single-digit model is never substring-grounded"
    );
  });

  it("token boundaries: brand must not match inside another word (audi vs audimas)", () => {
    assert.equal(
      groundBrandAttributesInUserText({ brand: "audi" }, "audimas iki 500")?.brand,
      undefined
    );
    assert.equal(
      groundBrandAttributesInUserText({ brand: "audi" }, "audi a4 iki 15000")?.brand,
      "audi"
    );
  });

  it("brand/model independence: each identity field grounds on its own", () => {
    assert.equal(
      groundBrandAttributesInUserText(
        { brand: "Kia", model: "Sportage" },
        "Kia iki 20000"
      )?.model,
      undefined,
      "brand present, model absent"
    );
    assert.equal(
      groundBrandAttributesInUserText(
        { brand: "Kia", model: "Sportage" },
        "Sportage iki 20000"
      )?.brand,
      undefined,
      "model present, brand absent"
    );
  });

  it("multi-word brand grounds as a contiguous token sequence", () => {
    assert.equal(
      groundBrandAttributesInUserText(
        { brand: "Mercedes Benz" },
        "mercedes benz iki 20000"
      )?.brand,
      "Mercedes Benz"
    );
    assert.equal(
      groundBrandAttributesInUserText(
        { brand: "Mercedes Benz" },
        "benz iki 20000"
      )?.brand,
      undefined,
      "partial sequence (only one token) does not ground"
    );
  });
});

describe("E2.8 — search-intent layer: advisory queries never force a product/brand", () => {
  it("advisory query returns a NEUTRAL result WITHOUT a model call (no invented product)", async () => {
    delete process.env.GEMINI_API_KEY;
    const result = await analyzeSearchIntent({
      query: "nežinau ko noriu, reikia šeimai patikimo automobilio iki 20 tūkst. €, ką siūlytum?",
    });
    assert.equal(result.category, null, "no forced category");
    assert.equal(result.cleanQuery, "", "no invented product/brand in cleanQuery");
    assert.equal(result.location, "");
    assert.equal(result.condition, null);
  });

  it("advisory with an explicit search verb is NOT neutralized by this guard", () => {
    assert.equal(
      isAdvisoryInterrogative("surask, ką rekomenduotum — automobilį iki 20000"),
      false,
      "search verb keeps the normal analyzer path"
    );
  });
});
