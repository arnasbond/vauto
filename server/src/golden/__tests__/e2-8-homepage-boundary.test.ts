/**
 * E2.8 — REAL-BOUNDARY regression: the HOMEPAGE submission path.
 *
 * The homepage AI input sends every message with `fromSearchBar: true`
 * (AiCommandBar → sendAgentMessage(q, { fromSearchBar: true })). This suite
 * drives the REAL `/api/vauto-agent/stream` route with that exact context
 * and proves the advisory class survives the search-bar fast-path.
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
  createScriptedModelProvider,
  fc,
  round,
  text,
} from "../harness/scripted-model-provider.js";
import { parseLiveStreamBody } from "../harness/live-stream-parser.js";
import { executeAgentTool } from "../../ai/agent-tools.js";
import type { AgentToolContext } from "../../ai/agent-tools.js";

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

const ADVISORY =
  "Nežinau ko noriu, bet reikia šeimai patikimo automobilio iki 20 tūkst. eurų, ką siūlytum?";

async function runHomepageTurn(
  userText: string,
  scripted: string,
  toolParts: Array<ReturnType<typeof fc> | ReturnType<typeof text>> = []
) {
  setThreadStoreForTests(new InMemoryThreadStore());
  setPlannerDecisionProviderForTests(async (input) => planTurn(input));
  const recorder = createScriptedModelProvider({
    turns: [[round(...[...toolParts, text(scripted)])]],
    exhausted: { parts: [] },
  });
  const prev = recorder.install();
  process.env.GEMINI_API_KEY = "e28-boundary-key";
  const app = createApp();
  try {
    const res = await request(app)
      .post("/api/vauto-agent/stream")
      .send({
        turnId: `e28-b`,
        messages: [{ role: "user", text: userText }],
        context: {
          isAuthenticated: true,
          userCity: "Vilnius",
          contact: "+37060000000",
          profilePhone: "+37060000000",
          fromSearchBar: true, // EXACT homepage submission context
        },
      });
    return parseLiveStreamBody(String(res.text ?? ""));
  } finally {
    recorder.restore();
    if (prev) globalThis.fetch = prev;
  }
}

/**
 * E2.8 DETERMINISTIC ADVISORY POLICY — drives the REAL production LLM-
 * planner path (adapter → zod → deriveRouting → applyDeterministicClamps)
 * with a scripted planner output, then the REAL /stream route. The
 * advisory semantic class must survive ANY schema-valid planner intent.
 */
function llmPlannerAdapter(decision: Record<string, unknown>): PlannerLlmAdapter {
  return {
    providerId: "scripted-planner",
    async planStructured(_req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
      return { args: decision, provider: "scripted-planner", model: "sp-1" };
    },
  };
}

async function runHomepageTurnWithLlmPlanner(
  userText: string,
  plannerDecision: Record<string, unknown>,
  scriptedModelText: string,
  toolParts: Array<ReturnType<typeof fc> | ReturnType<typeof text>> = []
) {
  setThreadStoreForTests(new InMemoryThreadStore());
  setPlannerAdapterForTests(llmPlannerAdapter(plannerDecision));
  const recorder = createScriptedModelProvider({
    turns: [[round(...[...toolParts, text(scriptedModelText)])]],
    exhausted: { parts: [] },
  });
  const prev = recorder.install();
  process.env.GEMINI_API_KEY = "e28-boundary-key";
  const app = createApp();
  try {
    const res = await request(app)
      .post("/api/vauto-agent/stream")
      .send({
        turnId: `e28-p`,
        messages: [{ role: "user", text: userText }],
        context: {
          isAuthenticated: true,
          userCity: "Vilnius",
          contact: "+37060000000",
          profilePhone: "+37060000000",
          fromSearchBar: true, // EXACT homepage submission context
        },
      });
    return parseLiveStreamBody(String(res.text ?? ""));
  } finally {
    recorder.restore();
    if (prev) globalThis.fetch = prev;
  }
}

const LLM_CLARIFY_DECISION = {
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

const LLM_CONTEXT_QUESTION_DECISION = {
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

const LLM_SEARCH_DECISION = {
  intent: "catalog_search",
  goal: "search the catalog",
  continuationOf: "none",
  action: "catalog_search",
  tool: "searchListings",
  toolArgs: { query: "šeimos automobilis iki 20000" },
  needsClarification: false,
  confidence: 0.95,
  reasons: ["model_guess"],
};

describe("E2.8 — real homepage boundary (/stream + fromSearchBar=true)", () => {
  it("advisory sentence is NEVER forced into catalog search — conversational reply, no wishlist", async () => {
    const stream = await runHomepageTurn(
      ADVISORY,
      "Galiu pasiūlyti kelias patikimas šeimos mašinas iki 20 tūkst. — norite peržiūrėti?"
    );
    assert.ok(stream.finalResult, "final event arrived");
    assert.ok(stream.finalResult!.reply.length > 0, "conversational reply present");
    assert.match(stream.finalResult!.reply, /pasiūlyti|peržiūrėti/i);
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(!tools.includes("searchListings"), "no catalog execution");
    assert.equal(
      (stream.finalResult!.actions as Record<string, unknown>).type,
      "none",
      "no search/empty_search side effect — no wishlist CTA"
    );
    assert.equal(stream.errorEvent, null);
  });

  it("CASE A — model prose searchListings on advisory turn is BLOCKED (no empty_search, reply completes)", async () => {
    const stream = await runHomepageTurn(
      ADVISORY,
      "Galiu patarti — patikimi šeimos automobiliai iki 20 tūkst. yra Volvo arba Toyota.",
      [fc("searchListings", { query: "Matau kad šiuo metu tokios prekės neturime" })]
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(!tools.includes("searchListings"), "prose searchListings NOT executed");
    assert.equal(
      (stream.finalResult!.actions as Record<string, unknown>).type,
      "none",
      "no empty_search side effect"
    );
    assert.match(stream.finalResult!.reply, /patarti|Volvo|Toyota/i, "conversational answer completes");
  });

  it("CASE B — even a sensible grounded search on the advisory turn is policy-blocked", async () => {
    const stream = await runHomepageTurn(
      ADVISORY,
      "Galėčiau parodyti kelis variantus, jei norite — pasakykite kriterijus.",
      [fc("searchListings", { query: "patikimas šeimos automobilis iki 20000" })]
    );
    assert.ok(
      !stream.finalResult!.toolCalls.some((t) => t.name === "searchListings"),
      "user asked for advice, not automatic catalog execution"
    );
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
  });

  it("CASE C — applyFilter/updateUIFilters on advisory turn produce NO filter mutation", async () => {
    const stream = await runHomepageTurn(
      ADVISORY,
      "Patarčiau žiūrėti patikimus benzininius automobilius.",
      [
        fc("applyFilter", { category: "brand", value: "Kia" }),
        fc("updateUIFilters", { categoryAttributes: { brand: "Kia" } }),
      ]
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(!tools.includes("applyFilter"), "applyFilter blocked");
    assert.ok(!tools.includes("updateUIFilters"), "updateUIFilters blocked");
    const actions = stream.finalResult!.actions as Record<string, unknown>;
    assert.equal(actions.type, "none", "no search-state mutation");
    assert.match(stream.finalResult!.reply, /patarčiau|benzininius/i);
  });

  it("CASE D — repeated identical advisory runs keep the SAME invariants despite varying model prose", async () => {
    const variants = [
      { q: "Matau kad šiuo metu tokios prekės neturime", reply: "Patariu Volvo arba Toyota." },
      { q: "gal reikėtų Kia?", reply: "Galite rinktis naudotą benzininį automobilį." },
      { q: "neradau nieko pagal kriterijus", reply: "Patikslinkite biudžetą — pasiūlysiu variantų." },
    ];
    for (const v of variants) {
      const stream = await runHomepageTurn(ADVISORY, v.reply, [
        fc("searchListings", { query: v.q }),
      ]);
      assert.ok(
        !stream.finalResult!.toolCalls.some((t) => t.name === "searchListings"),
        `variant "${v.q}" must not execute catalog`
      );
      assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
      assert.ok(stream.finalResult!.reply.length > 0, "conversational reply completes");
    }
  });

  it("CASE A — model createUserRequirement on advisory is DENIED (no persistence path, no wanted action)", async () => {
    const stream = await runHomepageTurn(
      ADVISORY,
      "Galiu patarti — patikimi šeimos automobiliai yra Volvo arba Toyota.",
      [fc("createUserRequirement", { query: "šeimos automobilis iki 20000" })]
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(!tools.includes("createUserRequirement"), "tool handler never ran → no DB insert");
    const actions = stream.finalResult!.actions as Record<string, unknown>;
    assert.equal(actions.type, "none", "no create_user_requirement action → no client wishlist path");
    assert.match(stream.finalResult!.reply, /patarti|Volvo|Toyota/i, "conversational answer completes");
  });

  it("CASE B — navigateTo/navigateToScreen/openListingForm on advisory are DENIED", async () => {
    const stream = await runHomepageTurn(
      ADVISORY,
      "Geriausia būtų pasižiūrėti keletą variantų kartu.",
      [
        fc("navigateTo", { screen: "search" }),
        fc("navigateToScreen", { screen: "search" }),
        fc("openListingForm", {}),
      ]
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    for (const t of ["navigateTo", "navigateToScreen", "openListingForm"]) {
      assert.ok(!tools.includes(t), `${t} denied`);
    }
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
  });

  it("CASE D — create_listing_draft / proposeSmartBargaining / triggerMicroPayment on advisory are DENIED", async () => {
    const stream = await runHomepageTurn(
      ADVISORY,
      "Galite patikslinti kriterijus — tada pasiūlysiu geriausią variantą.",
      [
        fc("create_listing_draft", { category: "vehicles" }),
        fc("proposeSmartBargaining", { listingId: "lt-x" }),
        fc("triggerMicroPayment", { amount: 5 }),
      ]
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    for (const t of ["create_listing_draft", "proposeSmartBargaining", "triggerMicroPayment"]) {
      assert.ok(!tools.includes(t), `${t} denied`);
    }
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
  });

  it("CASE E — allowlisted read-only tool executes on advisory (analyzeMarketPrice)", async () => {
    const stream = await runHomepageTurn(
      ADVISORY,
      "Vidutinė rinkos kaina leidžia pasiūlyti gerą biudžetą.",
      [fc("analyzeMarketPrice", { brand: "Volvo", model: "V70" })]
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(tools.includes("analyzeMarketPrice"), "read-only tool executed");
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none", "no side effect");
    assert.match(stream.finalResult!.reply, /kaina|biudžetą/i);
  });

  it("CASE F — unknown/future synthetic tool is FAIL-CLOSED denied on advisory", async () => {
    const stream = await runHomepageTurn(
      ADVISORY,
      "Tęskime pokalbį — pasiūlysiu variantų.",
      [fc("futureMagicTool" as never, { anything: true })]
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(!tools.includes("futureMagicTool"), "not in allowlist → denied");
    assert.equal(stream.errorEvent, null, "turn completes without crash");
    assert.ok(stream.finalResult!.reply.length > 0);
  });

  it("CASE G — explicit wanted request keeps the legitimate createUserRequirement path (not advisory)", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    setPlannerDecisionProviderForTests(async (input) => planTurn(input));
    const recorder = createScriptedModelProvider({
      turns: [[round(fc("createUserRequirement", { query: "Kia Sportage iki 20000" }))]],
      exhausted: { parts: [] },
    });
    const prev = recorder.install();
    process.env.GEMINI_API_KEY = "e28-boundary-key";
    const app = createApp();
    try {
      const res = await request(app).post("/api/vauto-agent/stream").send({
        turnId: "e28-g",
        messages: [{ role: "user", text: "Pranešk, kai atsiras Kia Sportage iki 20000" }],
        context: {
          isAuthenticated: false, // guest → needsAuth path is the legitimate policy
          userCity: "Vilnius",
          contact: "+37060000000",
          profilePhone: "+37060000000",
        },
      });
      const stream = parseLiveStreamBody(String(res.text ?? ""));
      const tools = stream.finalResult!.toolCalls.map((t) => t.name);
      assert.ok(tools.includes("createUserRequirement"), "wanted tool ALLOWED on a non-advisory wanted request");
      const actions = stream.finalResult!.actions as Record<string, unknown>;
      assert.equal(actions.type, "create_user_requirement", "legitimate wanted action emitted (needsAuth flow)");
    } finally {
      recorder.restore();
      if (prev) globalThis.fetch = prev;
    }
  });

  it("CASE I — repeated advisory runs with varied tool choices keep identical invariants", async () => {
    const variants: Array<Array<ReturnType<typeof fc>>> = [
      [fc("searchListings", { query: "Matau kad šiuo metu tokios prekės neturime" })],
      [fc("createUserRequirement", { query: "šeimos automobilis" })],
      [fc("applyFilter", { category: "brand", value: "Kia" })],
      [fc("navigateTo", { screen: "search" })],
      [fc("updateUIFilters", { categoryAttributes: { brand: "Kia" } })],
    ];
    for (const v of variants) {
      const stream = await runHomepageTurn(
        ADVISORY,
        "Galiu pasiūlyti patikimų variantų — papasakokite daugiau apie poreikius.",
        v
      );
      assert.equal(
        (stream.finalResult!.actions as Record<string, unknown>).type,
        "none",
        `variant ${JSON.stringify(v[0])} produced no side effect`
      );
      assert.ok(
        stream.finalResult!.toolCalls.every(
          (t) => !["searchListings", "applyFilter", "updateUIFilters", "createUserRequirement", "navigateTo"].includes(t.name)
        ),
        "no mutating tool executed"
      );
      assert.ok(stream.finalResult!.reply.length > 0, "conversational reply completes");
    }
  });

  it("negative control: explicit search with fromSearchBar still executes searchListings", async () => {
    const stream = await runHomepageTurn("surask Kia Sportage iki 20000", "Radau 1 variantą.");
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(tools.includes("searchListings"), "explicit search keeps the fast-path");
  });

  it("negative control: facet query without advice still searches (automobiliai iki 20000)", async () => {
    const stream = await runHomepageTurn("automobiliai iki 20000", "Radau 1 variantą.");
    assert.ok(
      stream.finalResult!.toolCalls.some((t) => t.name === "searchListings")
    );
  });

  it("negative control: browse request still searches (parodyk šeimai automobilius iki 20000)", async () => {
    const stream = await runHomepageTurn(
      "parodyk šeimai automobilius iki 20000",
      "Radau 1 variantą."
    );
    assert.ok(
      stream.finalResult!.toolCalls.some((t) => t.name === "searchListings")
    );
  });
});

describe("E2.8 — deterministic advisory policy boundary (real LLM planner path)", () => {
  it("CASE J — LLM planner clarify_ambiguous for the advisory sentence → conversational answer, NO buy/sell echo", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      ADVISORY,
      LLM_CLARIFY_DECISION,
      "Galiu pasiūlyti patikimų šeimos automobilių iki 20 tūkst. — koks kėbulo tipas Jums svarbiausias?"
    );
    assert.ok(stream.finalResult, "final event arrived");
    assert.doesNotMatch(
      stream.finalResult!.reply,
      /pirkti ar parduoti/i,
      "deterministic buy/sell executor must not consume the advisory sentence"
    );
    assert.match(stream.finalResult!.reply, /pasiūlyti|svarbiausias/i);
    assert.equal(
      (stream.finalResult!.actions as Record<string, unknown>).type,
      "none",
      "no side effect"
    );
    assert.equal(stream.errorEvent, null);
  });

  it("CASE K — LLM planner context_question directly + model searchListings attempt → DENIED (advisoryContext total)", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      ADVISORY,
      LLM_CONTEXT_QUESTION_DECISION,
      "Rekomenduoju žiūrėti Volvo arba Toyota iki 20 tūkst.",
      [fc("searchListings", { query: "šeimos automobilis iki 20000" })]
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(
      !tools.includes("searchListings"),
      "advisoryContext must be TRUE even when the LLM already said context_question"
    );
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
    assert.match(stream.finalResult!.reply, /Volvo|Toyota/i);
  });

  it("CASE L — LLM planner catalog_search confidence 0.5 for advisory → advisory override, tool denied", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      ADVISORY,
      { ...LLM_SEARCH_DECISION, confidence: 0.5 },
      "Patarčiau rinktis naudotą benzininį hečbeką.",
      [fc("searchListings", { query: "šeimos automobilis iki 20000" })]
    );
    assert.ok(
      !stream.finalResult!.toolCalls.some((t) => t.name === "searchListings"),
      "low-confidence search must not escape the advisory class"
    );
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
    assert.match(stream.finalResult!.reply, /patarčiau|benzininį/i);
  });

  it("CASE L2 — LLM planner catalog_search confidence 0.95 CANNOT defeat the advisory policy", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      ADVISORY,
      { ...LLM_SEARCH_DECISION, confidence: 0.95 },
      "Pasakykite daugiau apie važiavimo sąlygas — pasiūlysiu variantų.",
      [fc("searchListings", { query: "šeimos automobilis iki 20000" })]
    );
    assert.ok(
      !stream.finalResult!.toolCalls.some((t) => t.name === "searchListings"),
      "high model confidence must not override the semantic advisory policy"
    );
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
    assert.ok(stream.finalResult!.reply.length > 0);
  });

  it("CASE O — every LLM planner intent converges to the same advisory invariants", async () => {
    const plannerVariants: Array<Record<string, unknown>> = [
      LLM_CLARIFY_DECISION,
      LLM_CONTEXT_QUESTION_DECISION,
      LLM_DIALOG_DECISION,
      { ...LLM_SEARCH_DECISION, confidence: 0.5 },
      { ...LLM_SEARCH_DECISION, confidence: 0.95 },
    ];
    for (const planner of plannerVariants) {
      const stream = await runHomepageTurnWithLlmPlanner(
        ADVISORY,
        planner,
        "Galiu rekomenduoti patikimų variantų — patikslinkite biudžetą ir kėbulo tipą.",
        [fc("searchListings", { query: "šeimos automobilis iki 20000" })]
      );
      assert.ok(
        !stream.finalResult!.toolCalls.some((t) => t.name === "searchListings"),
        `planner ${String(planner.intent)} must not authorize catalog execution`
      );
      assert.equal(
        (stream.finalResult!.actions as Record<string, unknown>).type,
        "none",
        `planner ${String(planner.intent)} produced no side effect`
      );
      assert.ok(stream.finalResult!.reply.length > 0, "conversational reply completes");
    }
  });

  it("CASE M — explicit search verb keeps catalog execution with the LLM planner (surask Kia Sportage iki 20000)", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      "surask Kia Sportage iki 20000",
      LLM_SEARCH_DECISION,
      "Radau 1 variantą.",
      [fc("searchListings", { query: "Kia Sportage iki 20000" })]
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(tools.includes("searchListings"), "explicit search executes");
    const actionType = (stream.finalResult!.actions as Record<string, unknown>).type;
    assert.ok(
      actionType === "search" || actionType === "empty_search",
      `search-class action emitted (got ${String(actionType)})`
    );
  });

  it("CASE N — true bare-noun ambiguity keeps the buy/sell clarify (iPhone)", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      "iPhone",
      LLM_SEARCH_DECISION,
      "nevyksta" // model loop is never reached — deterministic executor answers
    );
    assert.match(stream.finalResult!.reply, /pirkti ar parduoti/i);
    assert.equal(
      (stream.finalResult!.actions as Record<string, unknown>).type,
      "none"
    );
  });
});

describe("E2.8 — first-class explicit wanted intent (real homepage boundary)", () => {
  const WANTED = "Pranešk, kai atsiras Kia Sportage iki 20000 eurų";

  async function runWantedTurn(
    userText: string,
    plannerDecision: Record<string, unknown>,
    opts: { authenticated?: boolean; userId?: string } = {}
  ) {
    setThreadStoreForTests(new InMemoryThreadStore());
    setPlannerAdapterForTests(llmPlannerAdapter(plannerDecision));
    const recorder = createScriptedModelProvider({
      turns: [[round(text("nevyksta"))]],
      exhausted: { parts: [] },
    });
    const prev = recorder.install();
    process.env.GEMINI_API_KEY = "e28-boundary-key";
    if (opts.userId) process.env.ALLOW_LEGACY_USER_HEADER = "true";
    const app = createApp();
    try {
      let reqBuilder = request(app).post("/api/vauto-agent/stream");
      if (opts.userId) reqBuilder = reqBuilder.set("X-User-Id", opts.userId);
      const res = await reqBuilder.send({
          turnId: "e28-w",
          messages: [{ role: "user", text: userText }],
          context: {
            isAuthenticated: Boolean(opts.authenticated),
            userCity: "Vilnius",
            contact: "+37060000000",
            profilePhone: "+37060000000",
            fromSearchBar: true, // EXACT homepage submission context
          },
        });
      return parseLiveStreamBody(String(res.text ?? ""));
    } finally {
      recorder.restore();
      if (prev) globalThis.fetch = prev;
      delete process.env.ALLOW_LEGACY_USER_HEADER;
    }
  }

  it("CASE W1 — explicit wanted from the homepage (guest) → wanted_registration, NO search, NO empty_search", async () => {
    const stream = await runWantedTurn(WANTED, LLM_SEARCH_DECISION, {});
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(
      tools.includes("createUserRequirement"),
      "the audited wanted capability executed"
    );
    assert.ok(!tools.includes("searchListings"), "no catalog search prerequisite");
    const actions = stream.finalResult!.actions as Record<string, unknown>;
    assert.equal(
      actions.type,
      "create_user_requirement",
      "wanted action emitted (not search/empty_search)"
    );
    assert.equal(
      (actions as { needsAuth?: boolean }).needsAuth,
      true,
      "guest gets the honest needsAuth flow"
    );
    assert.ok(stream.finalResult!.reply.length > 0, "honest reply present");
  });

  it("CASE W2 — reordered wanted phrasing converges to the same intent", async () => {
    const stream = await runWantedTurn(
      "Kai atsiras Kia Sportage iki 20000 eurų, pranešk man",
      LLM_SEARCH_DECISION,
      {}
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(tools.includes("createUserRequirement"));
    assert.ok(!tools.includes("searchListings"));
    assert.equal(
      (stream.finalResult!.actions as Record<string, unknown>).type,
      "create_user_requirement"
    );
  });

  it("CASE W3 — wanted phrasing without a price still registers (grounded make present)", async () => {
    const stream = await runWantedTurn(
      "Noriu gauti pranešimą, kai atsiras Kia Sportage",
      LLM_DIALOG_DECISION,
      {}
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(tools.includes("createUserRequirement"));
    assert.ok(!tools.includes("searchListings"));
    assert.equal(
      (stream.finalResult!.actions as Record<string, unknown>).type,
      "create_user_requirement"
    );
  });

  it("CASE W7 — every LLM planner intent converges to wanted_registration on the homepage", async () => {
    for (const planner of [
      LLM_SEARCH_DECISION,
      LLM_DIALOG_DECISION,
      LLM_CONTEXT_QUESTION_DECISION,
      LLM_CLARIFY_DECISION,
    ]) {
      const stream = await runWantedTurn(WANTED, planner, {});
      const tools = stream.finalResult!.toolCalls.map((t) => t.name);
      assert.ok(
        tools.includes("createUserRequirement"),
        `planner ${String(planner.intent)} must not defeat the wanted class`
      );
      assert.ok(!tools.includes("searchListings"));
      assert.equal(
        (stream.finalResult!.actions as Record<string, unknown>).type,
        "create_user_requirement",
        `planner ${String(planner.intent)}`
      );
    }
  });

  it("CASE W5 — authenticated wanted runs the persistence handler (unit: no DB locally, branch proven)", async () => {
    // The authenticated HTTP route resolves the user profile via the DB
    // (unavailable in this local environment), so the authenticated branch
    // is proven at the capability level: ctx.authUserId set → the tool's
    // insertUserRequirement branch is taken (needsAuth is NOT set, the
    // honest persistence-failure message is returned, and NO wanted action
    // is fabricated).
    const { result, sideEffect } = await executeAgentTool(
      "createUserRequirement",
      { query: "kia sportage", category: "vehicles", maxPrice: 20000 },
      {
        userCity: "Vilnius",
        userRole: "buyer",
        authUserId: "u-w5-test",
        listingsSnapshot: [],
      } as unknown as AgentToolContext
    );
    const r = result as { ok?: boolean; needsAuth?: boolean; message?: string };
    assert.notEqual(r.needsAuth, true, "authenticated branch — no guest needsAuth");
    assert.equal(r.ok, false, "no fabricated success without persistence");
    assert.equal(sideEffect, undefined, "no fabricated wanted action without persistence");
  });

  it("CASE W11 — false positive never becomes wanted_registration", async () => {
    const stream = await runWantedTurn(
      "Pranešk, kai baigsi redaguoti skelbimą",
      LLM_SEARCH_DECISION,
      {}
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(
      !tools.includes("createUserRequirement"),
      "generic notify phrasing is not a catalog wanted request"
    );
  });

  it("W-PRO1 — proactive-wrapper wanted turn extracts a CLEAN grounded requirement", async () => {
    const stream = await runWantedTurn(
      "[Proaktyvi intervencija: match — pranešk, kai atsiras kia sportage iki 20000]",
      LLM_SEARCH_DECISION,
      {}
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(tools.includes("createUserRequirement"), "wanted capability executed");
    assert.ok(!tools.includes("searchListings"), "no catalog search");
    const actions = stream.finalResult!.actions as Record<string, unknown> & {
      requirement?: { query?: string; maxPrice?: number; category?: string };
      label?: string;
      needsAuth?: boolean;
    };
    assert.equal(actions.type, "create_user_requirement");
    assert.equal(actions.requirement?.query, "kia sportage", "wrapper + notify tokens must not persist");
    assert.equal(actions.requirement?.maxPrice, 20000, "grounded price bound persists");
    assert.equal(actions.requirement?.category, "vehicles", "grounded make normalizes the vehicle vertical");
    assert.doesNotMatch(
      actions.label ?? "",
      /proaktyvi|intervencija|match/i,
      "orchestration metadata never appears in the user-facing label"
    );
  });

  it("W-PRO2 — wrapped ADVISORY stays conversational (no wanted, no search)", async () => {
    const stream = await runWantedTurn(
      "[Proaktyvi intervencija: match — nežinau ko noriu, bet reikia šeimai patikimo automobilio iki 20000, ką siūlytum?]",
      LLM_SEARCH_DECISION,
      {}
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(!tools.includes("createUserRequirement"), "not wanted");
    assert.ok(!tools.includes("searchListings"), "not search");
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
  });

  it("W-PRO4 — attachment-prefix + explicit wanted → clean grounded extraction", async () => {
    const stream = await runWantedTurn(
      "[Nuotraukos įkeltos] pranešk, kai atsiras Kia Sportage iki 20000",
      LLM_SEARCH_DECISION,
      {}
    );
    const actions = stream.finalResult!.actions as Record<string, unknown> & {
      requirement?: { query?: string; maxPrice?: number };
    };
    assert.equal(actions.type, "create_user_requirement");
    assert.equal(actions.requirement?.query, "kia sportage");
    assert.equal(actions.requirement?.maxPrice, 20000);
  });

  it("W-PRO5 — wrapper-only metadata is never catalog target evidence", async () => {
    const stream = await runWantedTurn(
      "[Proaktyvi intervencija: match]",
      LLM_SEARCH_DECISION,
      {}
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(!tools.includes("createUserRequirement"), "no wanted registration from metadata");
    assert.notEqual(
      (stream.finalResult!.actions as Record<string, unknown>).type,
      "create_user_requirement"
    );
  });
});

describe("E2.8 — discovery vs execution authority (real homepage boundary)", () => {
  const DISCOVERY =
    "Turiu apie 20 tūkst. eurų šeimos automobiliui, bet visiškai nežinau, ką rinktis. Nuo ko pradėtum?";

  it("production discovery sentence → conversational advisory, NO search, NO facets, NO wanted", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      DISCOVERY,
      LLM_SEARCH_DECISION,
      "Galite pradėti nuo kėbulo tipo — sedanas, universalas ar SUV? Patarsiu toliau."
    );
    const tools = stream.finalResult!.toolCalls.map((t) => t.name);
    assert.ok(!tools.includes("searchListings"), "no catalog execution");
    assert.equal(
      (stream.finalResult!.actions as Record<string, unknown>).type,
      "none",
      "no facet materialization side effect"
    );
    assert.match(stream.finalResult!.reply, /kėbulo|Patarsiu/i);
    assert.equal(stream.errorEvent, null);
  });

  it("uncertainty without a question mark → advisory (Nežinau ką rinktis. Nuo ko pradėtum)", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      "Nežinau ką rinktis. Nuo ko pradėtum?",
      LLM_SEARCH_DECISION,
      "Rekomenduoju pradėti nuo biudžeto ir kėbulo tipo."
    );
    assert.ok(
      !stream.finalResult!.toolCalls.some((t) => t.name === "searchListings")
    );
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
  });

  it("polite modal directive EXECUTES (Gal gali surasti Kia Sportage iki 20000?)", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      "Gal gali surasti Kia Sportage iki 20000?",
      LLM_SEARCH_DECISION,
      "Radau 1 variantą.",
      [fc("searchListings", { query: "Kia Sportage iki 20000" })]
    );
    assert.ok(
      stream.finalResult!.toolCalls.some((t) => t.name === "searchListings"),
      "explicit directive executes despite the interrogative form"
    );
  });

  it("„Ar verta ieškoti…?\" stays advisory despite search vocabulary", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      "Ar verta ieškoti Kia Sportage iki 20000?",
      LLM_SEARCH_DECISION,
      "Galiu patarti: jei norite rinkos vaizdo, galiu parodyti dabartinius variantus."
    );
    assert.ok(
      !stream.finalResult!.toolCalls.some((t) => t.name === "searchListings")
    );
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
  });

  it("„Ką manai apie Kia Sportage iki 20000?\" → advisory, no execution", async () => {
    const stream = await runHomepageTurnWithLlmPlanner(
      "Ką manai apie Kia Sportage iki 20000?",
      LLM_SEARCH_DECISION,
      "Kia Sportage yra patikimas pasirinkimas — norėtumėte peržiūrėti skelbimus?"
    );
    assert.ok(
      !stream.finalResult!.toolCalls.some((t) => t.name === "searchListings")
    );
    assert.equal((stream.finalResult!.actions as Record<string, unknown>).type, "none");
  });
});
