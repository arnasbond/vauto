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
import { setPlannerDecisionProviderForTests } from "../../ai/planner/planner-orchestrator.js";
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
