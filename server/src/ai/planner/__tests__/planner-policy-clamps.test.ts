/**
 * E2.5 — POLICY CLAMP GENERALIZATION (behavior classes, NOT phrases).
 *
 * Every phrase here is UNSEEN (not in golden 32, not in paraphrase 14, not
 * in open-domain 33, not in LIVE-01…15). The fake provider mimics the REAL
 * model failure modes observed in the 11/15 LIVE run (search-happy
 * misclassification of ambiguous/cancel/publish/consequential turns). The
 * deterministic policy clamps must correct the CLASS — proving the fix is
 * architectural, not a phrase hardcode.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resolvePlannerDecision, setPlannerAdapterForTests, setPlannerDecisionProviderForTests } from "../planner-orchestrator.js";
import type { PlannerLlmAdapter, PlannerStructuredRequest, PlannerStructuredResponse } from "../planner-provider.js";
import type { PlannerContextInput } from "../planner-types.js";

afterEach(() => {
  setPlannerAdapterForTests(null);
  setPlannerDecisionProviderForTests(null);
});

/** Search-happy fake model — the observed LIVE failure mode. */
function searchHappyAdapter(decision: Record<string, unknown>): PlannerLlmAdapter {
  return {
    providerId: "fake-search-happy",
    async planStructured(_req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
      return { args: decision, provider: "fake-search-happy", model: "sh-1" };
    },
  };
}

const SEARCH_DECISION = {
  intent: "catalog_search",
  goal: "search the catalog",
  continuationOf: "none",
  action: "catalog_search",
  tool: "searchListings",
  toolArgs: {},
  needsClarification: false,
  confidence: 0.95,
  reasons: ["model_guess"],
};

const DIALOG_DECISION = {
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

function ctx(patch: Partial<PlannerContextInput> = {}): PlannerContextInput {
  return {
    messages: [{ role: "user", text: patch.lastUserText ?? "" }],
    lastUserText: patch.lastUserText ?? "",
    hasDraft: false,
    isAuthenticated: true,
    hasSearchSession: false,
    modelAvailable: true,
    ...patch,
  };
}

describe("E2.5 — ambiguous-noun class (never auto-search, regardless of confidence)", () => {
  for (const phrase of ["iPad Pro", "Dviratis", "Sofos"]) {
    it(`„${phrase}“ with a search-happy model → clarify_ambiguous, no searchListings`, async () => {
      setPlannerAdapterForTests(searchHappyAdapter(SEARCH_DECISION));
      const d = await resolvePlannerDecision(ctx({ lastUserText: phrase }));
      assert.equal(d.intent, "clarify_ambiguous", phrase);
      assert.equal(d.routing, "deterministic_executor");
      assert.equal(d.tool, null);
      assert.ok(d.reasons.includes("single_product_noun"));
      assert.ok(d.clarificationQuestion?.includes("pirkti ar parduoti"));
    });
  }
});

describe("E2.5 — cancel class (canonical draft state, model misreads as search/dialog)", () => {
  for (const phrase of ["Palauk, kol kas neskelbk", "Atšauk publikavimą", "Dar nenoriu, sustokim"]) {
    it(`„${phrase}“ with an active draft → sell_cancel`, async () => {
      const misread = phrase.startsWith("Atšauk") ? DIALOG_DECISION : SEARCH_DECISION;
      setPlannerAdapterForTests(searchHappyAdapter(misread));
      const d = await resolvePlannerDecision(
        ctx({ lastUserText: phrase, hasDraft: true, draftTitle: "iPhone 15 Pro 256 GB", draftCategory: "electronics" })
      );
      assert.equal(d.intent, "sell_cancel", phrase);
      assert.equal(d.routing, "deterministic_executor");
      assert.equal(d.tool, null);
      assert.ok(d.reasons.includes("cancel_marker"));
    });
  }
});

describe("E2.5 — unauthorized publish class (auth boundary recognized deterministically)", () => {
  for (const phrase of ["Paskelbk mano skelbimą dabar", "Paskelbk jį iš karto"]) {
    it(`„${phrase}“ unauthenticated with a search-happy model → policy_deny_auth`, async () => {
      setPlannerAdapterForTests(searchHappyAdapter(SEARCH_DECISION));
      const d = await resolvePlannerDecision(
        ctx({ lastUserText: phrase, isAuthenticated: false })
      );
      assert.equal(d.intent, "publish_request", phrase);
      assert.equal(d.action, "policy_deny_auth");
      assert.equal(d.routing, "deterministic_executor");
      assert.equal(d.tool, null);
    });
  }

  it("authenticated publish is NOT trapped into the deny executor (readiness fallthrough)", async () => {
    setPlannerAdapterForTests(
      searchHappyAdapter({
        ...DIALOG_DECISION,
        intent: "publish_request",
        action: "publish_request",
        confidence: 0.9,
      })
    );
    const d = await resolvePlannerDecision(
      ctx({ lastUserText: "Publikuok", hasDraft: true, draftTitle: "iPhone 15 Pro 256 GB", isAuthenticated: true })
    );
    assert.equal(d.intent, "publish_request");
    assert.equal(d.routing, "fallthrough", "authenticated publish keeps the readiness flow");
  });
});

describe("E2.5 — consequential class (deterministic recognition, execution stays behind the boundary)", () => {
  for (const [phrase, expectedTool] of [
    ["Užblokuok mano skelbimą", "blockListing"],
    ["Pažymėk, kad automobilį pardaviau", "markListingSold"],
  ] as const) {
    it(`„${phrase}“ with a dialog-happy model → consequential_command + ${expectedTool} via the confirmation boundary`, async () => {
      setPlannerAdapterForTests(searchHappyAdapter(DIALOG_DECISION));
      const d = await resolvePlannerDecision(ctx({ lastUserText: phrase }));
      assert.equal(d.intent, "consequential_command", phrase);
      assert.equal(d.tool, expectedTool);
      assert.equal(d.routing, "model", "execution stays behind the model tool loop + confirmation boundary");
    });
  }
});

describe("E2.6 — consequential TARGET RESOLUTION from canonical state (the handoff fix)", () => {
  const SINGLE = [{ id: "lt-9", title: "Mano Volvo", status: "active" }];
  const MULTI = [
    { id: "lt-1", title: "Volvo", status: "active" },
    { id: "lt-2", title: "BMW", status: "active" },
  ];

  it("resolvable single listing → coherent plan: needsClarification=false, listingId in toolArgs (no direct mutation)", async () => {
    // The model hedged: dialog + needsClarification=true (observed LIVE-12
    // failure mode) — the boundary must produce a COHERENT plan instead.
    setPlannerAdapterForTests(
      searchHappyAdapter({
        ...DIALOG_DECISION,
        needsClarification: true,
        clarificationQuestion: "Kurį skelbimą?",
      })
    );
    const d = await resolvePlannerDecision(
      ctx({ lastUserText: "Pažymėk mano skelbimą parduotu", myListings: SINGLE })
    );
    assert.equal(d.intent, "consequential_command");
    assert.equal(d.tool, "markListingSold");
    assert.equal(d.routing, "model", "still through the confirmation boundary");
    assert.equal(d.needsClarification, false, "coherent plan — the boundary owns clarification");
    assert.equal((d.toolArgs as { listingId?: string }).listingId, "lt-9");
  });

  it("unseen variant: explicit listingId in the model args resolves immediately", async () => {
    setPlannerAdapterForTests(
      searchHappyAdapter({
        ...DIALOG_DECISION,
        toolArgs: { listingId: "lt-2" },
        needsClarification: true,
      })
    );
    const d = await resolvePlannerDecision(
      ctx({ lastUserText: "Pažymėk, kad šitas pardavimas įvyko", myListings: MULTI })
    );
    assert.equal(d.tool, "markListingSold");
    assert.equal(d.needsClarification, false);
    assert.equal((d.toolArgs as { listingId?: string }).listingId, "lt-2");
  });

  it("genuinely UNRESOLVED (multiple candidates, no id) → clarification stays correct, still no direct execution", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(DIALOG_DECISION));
    const d = await resolvePlannerDecision(
      ctx({ lastUserText: "Pažymėk, kad parduota", myListings: MULTI })
    );
    assert.equal(d.intent, "consequential_command");
    assert.equal(d.tool, "markListingSold");
    assert.equal(d.routing, "model");
    assert.equal(d.needsClarification, true);
    assert.ok(d.clarificationQuestion?.includes("Kurį"));
  });
});

describe("E2.6 — interrogative normalization (advice/recommendation → context_question)", () => {
  const ADVICE = [
    "Ką rekomenduotum parduodant automobilį?",
    "Kaip geriau nustatyti kainą?",
    "Kokią nuotrauką patartum įkelti?",
  ];
  for (const phrase of ADVICE) {
    it(`„${phrase}“ with a dialog-happy model → context_question`, async () => {
      setPlannerAdapterForTests(searchHappyAdapter(DIALOG_DECISION));
      const d = await resolvePlannerDecision(ctx({ lastUserText: phrase }));
      assert.equal(d.intent, "context_question", phrase);
      assert.equal(d.routing, "model");
    });
  }

  it("negative control: meta question about the assistant stays dialog", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(DIALOG_DECISION));
    const d = await resolvePlannerDecision(ctx({ lastUserText: "Ką tu gali?" }));
    assert.equal(d.intent, "dialog");
  });

  it("negative control: statements stay dialog (no interrogative)", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(DIALOG_DECISION));
    const d = await resolvePlannerDecision(ctx({ lastUserText: "Papasakok daugiau apie skelbimą" }));
    assert.equal(d.intent, "dialog");
  });

  it("negative control: interrogative normalization NEVER produces a search", async () => {
    setPlannerAdapterForTests(
      searchHappyAdapter({
        ...DIALOG_DECISION,
        intent: "dialog",
        confidence: 0.95,
      })
    );
    const d = await resolvePlannerDecision(ctx({ lastUserText: "Ką patartum dėl kainos?" }));
    assert.equal(d.intent, "context_question");
    assert.equal(d.tool, null);
    assert.equal(d.routing, "model");
  });
});

describe("E2.8 — advisory semantic class is a DETERMINISTIC policy boundary (totality)", () => {
  const ADVISORY =
    "Nežinau ko noriu, bet reikia šeimai patikimo automobilio iki 20 tūkst. eurų, ką siūlytum?";

  const CLARIFY_DECISION = {
    intent: "clarify_ambiguous",
    goal: "disambiguate buy vs sell",
    continuationOf: "none",
    action: "clarify_buy_or_sell",
    tool: null,
    toolArgs: {},
    needsClarification: true,
    clarificationQuestion: `Ar norite „${ADVISORY}“ pirkti ar parduoti?`,
    confidence: 0.9,
    reasons: ["ambiguous"],
  };

  const CONTEXT_QUESTION_DECISION = {
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

  function assertAdvisoryClass(d: Awaited<ReturnType<typeof resolvePlannerDecision>>) {
    assert.equal(d.intent, "context_question", "advisory semantic class wins");
    assert.equal(d.routing, "model", "model reasoning is never bypassed");
    assert.equal(d.advisoryContext, true, "advisory capability policy is ALWAYS active");
    assert.equal(d.tool, null, "no tool — the model answers in text");
    assert.equal(d.needsClarification, false);
    assert.equal(d.clarificationQuestion, null);
  }

  it("CASE J — LLM clarify_ambiguous for the advisory sentence → rewritten to advisory context_question", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(CLARIFY_DECISION));
    const d = await resolvePlannerDecision(ctx({ lastUserText: ADVISORY }));
    assertAdvisoryClass(d);
    assert.ok(
      (d.reasons ?? []).includes("advisory_interrogative"),
      "override reason recorded"
    );
  });

  it("CASE K — LLM context_question directly for advisory → advisoryContext STILL set (totality)", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(CONTEXT_QUESTION_DECISION));
    const d = await resolvePlannerDecision(ctx({ lastUserText: ADVISORY }));
    assertAdvisoryClass(d);
  });

  it("CASE Kb — LLM dialog directly for advisory → advisoryContext set", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(DIALOG_DECISION));
    const d = await resolvePlannerDecision(ctx({ lastUserText: ADVISORY }));
    assertAdvisoryClass(d);
  });

  it("CASE L — LLM catalog_search confidence 0.5 for advisory → deterministic advisory override", async () => {
    setPlannerAdapterForTests(
      searchHappyAdapter({ ...SEARCH_DECISION, confidence: 0.5 })
    );
    const d = await resolvePlannerDecision(ctx({ lastUserText: ADVISORY }));
    assertAdvisoryClass(d);
  });

  it("CASE L2 — LLM catalog_search confidence 0.95 CANNOT defeat the advisory class", async () => {
    setPlannerAdapterForTests(
      searchHappyAdapter({ ...SEARCH_DECISION, confidence: 0.95 })
    );
    const d = await resolvePlannerDecision(ctx({ lastUserText: ADVISORY }));
    assertAdvisoryClass(d);
  });

  it("CASE O — every LLM intent converges to the identical advisory decision", async () => {
    for (const decision of [
      CLARIFY_DECISION,
      CONTEXT_QUESTION_DECISION,
      DIALOG_DECISION,
      { ...SEARCH_DECISION, confidence: 0.5 },
      { ...SEARCH_DECISION, confidence: 0.95 },
    ]) {
      setPlannerAdapterForTests(searchHappyAdapter(decision));
      const d = await resolvePlannerDecision(ctx({ lastUserText: ADVISORY }));
      assertAdvisoryClass(d);
    }
  });

  it("CASE M — explicit search verb is NOT overridden (surask Kia Sportage iki 20000)", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(SEARCH_DECISION));
    const d = await resolvePlannerDecision(
      ctx({ lastUserText: "surask Kia Sportage iki 20000" })
    );
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.tool, "searchListings");
    assert.notEqual(d.advisoryContext, true);
  });

  it("CASE M — facet query without advice stays search (parodyk automobilius iki 20000)", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(SEARCH_DECISION));
    const d = await resolvePlannerDecision(
      ctx({ lastUserText: "parodyk automobilius iki 20000" })
    );
    assert.equal(d.intent, "catalog_search");
  });

  it("CASE N — true bare-noun ambiguity is preserved (iPhone → buy/sell clarify)", async () => {
    setPlannerAdapterForTests(searchHappyAdapter(SEARCH_DECISION));
    const d = await resolvePlannerDecision(ctx({ lastUserText: "iPhone" }));
    assert.equal(d.intent, "clarify_ambiguous");
    assert.equal(d.routing, "deterministic_executor");
    assert.ok(d.clarificationQuestion?.includes("pirkti ar parduoti"));
  });
});
