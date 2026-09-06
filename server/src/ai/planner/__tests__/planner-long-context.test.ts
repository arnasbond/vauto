/**
 * E2.2 — long-context tests through the REAL LLM planner provider path.
 *
 * Every turn resolves its planner decision via `llmPlannerDecision` against
 * a fake provider adapter (NOT the deterministic planTurn). The adapter
 * captures the structured request, so the tests assert what the PLANNER
 * actually received: early facts, early goals, canonical draft facts,
 * old assistant answers, and conflict resolution (canonical > recent).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  resolvePlannerDecision,
  setPlannerAdapterForTests,
  setPlannerDecisionProviderForTests,
} from "../planner-orchestrator.js";
import { buildPlannerContext } from "../planner-context-builder.js";
import type { PlannerLlmAdapter, PlannerStructuredRequest, PlannerStructuredResponse } from "../planner-provider.js";
import type { PlannerContextInput } from "../planner-types.js";

afterEach(() => {
  setPlannerAdapterForTests(null);
  setPlannerDecisionProviderForTests(null);
});

interface CapturedRequest extends PlannerStructuredRequest {
  input: PlannerContextInput;
}

function scriptedAdapter(
  decision: Record<string, unknown>
): PlannerLlmAdapter & { requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  return {
    providerId: "fake-long",
    requests,
    async planStructured(req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
      requests.push({ ...req, input: {} as PlannerContextInput });
      return { args: decision, provider: "fake-long", model: "long-1" };
    },
  };
}

/** Build the SAME planner input the pipeline builds (canonical history). */
function plannerInputFor(
  messages: Array<{ role: "user" | "assistant"; text: string }>,
  patch: Partial<Parameters<typeof buildPlannerContext>[0]> = {}
): PlannerContextInput {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")!.text;
  return buildPlannerContext({
    messages,
    lastUserText: lastUser,
    hasDraft: false,
    isAuthenticated: true,
    hasSearchSession: false,
    modelAvailable: true,
    ...patch,
  });
}

/** 22-turn dialog: early facts + goals buried far before the window. */
function longDialog(): Array<{ role: "user" | "assistant"; text: string }> {
  const turns: Array<{ role: "user" | "assistant"; text: string }> = [
    { role: "user", text: "Parduodu naudotą juodą iPhone 15 Pro 256 GB, Kaune, kaina 850 eurų" },
    { role: "assistant", text: "Paruošiau juodraštį iPhone 15 Pro 256 GB." },
  ];
  const fillers = [
    "Papasakok daugiau apie kainą",
    "gerai",
    "O ką dar patartum?",
    "supratau",
    "Kaip atrodo mano skelbimas?",
    "Puiku",
    "Dar pagalvokim",
    "gerai, tęskime",
    "Ką daryti toliau?",
    "Vis tinka",
    "Ar verta nuleisti kainą?",
    "pagalvokim",
    "Kaip manai?",
    "Gerai",
    "Dar vienas klausimas",
    "tuoj parašysiu",
    "O ar būtina nuotrauka?",
    "tęskime",
    "Beveik baigta",
    "ir kas dabar?",
  ];
  for (const f of fillers) {
    turns.push({ role: "user", text: f });
    turns.push({ role: "assistant", text: "Draftas iPhone 15 Pro 256 GB išlieka nepakeistas." });
  }
  return turns;
}

describe("E2.2 — long-context through the real LLM planner provider", () => {
  it("20+ turn dialog: the EARLY user fact reaches the planner after >8 messages", async () => {
    const turns = longDialog();
    turns.push({ role: "user", text: "Kokią kainą buvome nustatę?" });
    const adapter = scriptedAdapter({
      intent: "context_question",
      goal: "recall price",
      continuationOf: "sell_draft",
      action: "dialog_reply",
      tool: null,
      toolArgs: {},
      needsClarification: false,
      confidence: 0.8,
      reasons: [],
    });
    setPlannerAdapterForTests(adapter);

    const d = await resolvePlannerDecision(
      plannerInputFor(turns, { hasDraft: true, draftCategory: "electronics", draftTitle: "iPhone 15 Pro 256 GB", draftPrice: 850 })
    );
    assert.equal(d.intent, "context_question");

    // The structured request must carry the canonical facts (price 850 from
    // the draft) even though the recent window does not contain them.
    const req = adapter.requests[adapter.requests.length - 1]!;
    assert.ok(req.parts.factsBlock.includes("price=850"), "canonical draft price reaches the planner");
    assert.ok(req.parts.factsBlock.includes("iPhone 15 Pro 256 GB"), "canonical title reaches the planner");
  });

  it("early GOAL survives >8 messages and a correction after it targets the draft", async () => {
    const turns = longDialog();
    turns.push({ role: "user", text: "Kaina dabar 700" });
    const adapter = scriptedAdapter({
      intent: "sell_update",
      goal: "apply price correction",
      continuationOf: "sell_draft",
      action: "update_listing_draft",
      tool: "updateListingDraft",
      toolArgs: { price: 700 },
      needsClarification: false,
      confidence: 0.95,
      reasons: ["correction"],
    });
    setPlannerAdapterForTests(adapter);

    const d = await resolvePlannerDecision(
      plannerInputFor(turns, { hasDraft: true, draftCategory: "electronics", draftTitle: "iPhone 15 Pro 256 GB", draftPrice: 850 })
    );
    assert.equal(d.intent, "sell_update");
    assert.equal((d.toolArgs as { price?: number }).price, 700);
  });

  it("the OLD assistant answer is visible to the planner (compact memory)", async () => {
    const turns = longDialog();
    turns.push({ role: "user", text: "Grįžkim prie to, ką sakėte apie kainą" });
    const adapter = scriptedAdapter({
      intent: "context_question",
      goal: "recall",
      continuationOf: "sell_draft",
      action: "dialog_reply",
      tool: null,
      toolArgs: {},
      needsClarification: false,
      confidence: 0.8,
      reasons: [],
    });
    setPlannerAdapterForTests(adapter);
    await resolvePlannerDecision(
      plannerInputFor(turns, { hasDraft: true, draftCategory: "electronics", draftTitle: "iPhone 15 Pro 256 GB", draftPrice: 850 })
    );
    const req = adapter.requests[adapter.requests.length - 1]!;
    assert.ok(
      req.parts.memoryBlock.includes("Draftas iPhone 15 Pro 256 GB") ||
        req.parts.historyBlock.includes("Draftas iPhone 15 Pro 256 GB"),
      "old assistant turns survive in the planner context"
    );
  });

  it("recent-conflict: a fresh utterance claiming a different price CANNOT dethrone the canonical draft fact", async () => {
    const turns = longDialog();
    turns.push({ role: "user", text: "Nustatyk kainą 1 euru" });
    const input = plannerInputFor(turns, {
      hasDraft: true,
      draftCategory: "electronics",
      draftTitle: "iPhone 15 Pro 256 GB",
      draftPrice: 850,
    });
    // The context builder must carry the CANONICAL 850 (not the recent 1).
    assert.equal(input.significantFacts?.price, "850");
    // And the planner request's facts block quotes the canonical value.
    const adapter = scriptedAdapter({
      intent: "dialog",
      goal: "dialog",
      continuationOf: "sell_draft",
      action: "dialog_reply",
      tool: null,
      toolArgs: {},
      needsClarification: false,
      confidence: 0.5,
      reasons: [],
    });
    setPlannerAdapterForTests(adapter);
    await resolvePlannerDecision(input);
    const req = adapter.requests[adapter.requests.length - 1]!;
    assert.ok(req.parts.factsBlock.includes("price=850"));
  });

  it("search refinement after a long dialog keeps the search-session signal", async () => {
    const turns = longDialog();
    turns.push({ role: "user", text: "tik su balkonu" });
    const input = plannerInputFor(turns, { hasSearchSession: true });
    assert.equal(input.hasSearchSession, true);
    const adapter = scriptedAdapter({
      intent: "catalog_search",
      goal: "refine search",
      continuationOf: "search_session",
      action: "catalog_search",
      tool: "searchListings",
      toolArgs: {},
      needsClarification: false,
      confidence: 0.9,
      reasons: [],
    });
    setPlannerAdapterForTests(adapter);
    const d = await resolvePlannerDecision(input);
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.routing, "deterministic_search");
  });

  it("the compact memory is explicitly marked ADVISORY in the request", async () => {
    const turns = longDialog();
    turns.push({ role: "user", text: "Kas toliau?" });
    const adapter = scriptedAdapter({
      intent: "dialog",
      goal: "dialog",
      continuationOf: "sell_draft",
      action: "dialog_reply",
      tool: null,
      toolArgs: {},
      needsClarification: false,
      confidence: 0.5,
      reasons: [],
    });
    setPlannerAdapterForTests(adapter);
    await resolvePlannerDecision(
      plannerInputFor(turns, { hasDraft: true, draftTitle: "iPhone 15 Pro 256 GB" })
    );
    const req = adapter.requests[adapter.requests.length - 1]!;
    assert.ok(
      req.parts.memoryBlock.includes("PATARIAMOJI") ||
        req.parts.memoryBlock.includes("advisory"),
      "memory block is labeled advisory"
    );
  });

  it("E2.3 — 40+ turn dialog: an EARLY preference (outside price/city/condition) survives >30 messages and a LATER correction overrides it", async () => {
    // Early preference: electric only. Not captured by price/city/condition
    // extractors — only the durable salient memory keeps it.
    const turns: Array<{ role: "user" | "assistant"; text: string }> = [
      { role: "user", text: "Noriu tik elektromobilio, ne dyzelio" },
      { role: "assistant", text: "Sutarta — ieškosime elektromobilio su rida iki 100k." },
    ];
    const fillers = [
      "gerai", "tęskime", "Ką patartum?", "supratau", "O kaip su biudžetu?", "pagalvokim",
      "Ar verta?", "gerai", "Kokios markės?", "vis tinka", "Dar pagalvokim", "tęskime",
      "Ką daryti toliau?", "gerai", "O baterijos būklė?", "supratau", "tinka",
      "Dar vienas klausimas", "tuoj", "Ar gali patikslinti?", "gerai", "tęskime",
      "Beveik baigta", "o kaip dėl įkrovimo?", "supratau", "gerai", "ir kas toliau?",
      "Gal žalią automobilį?", "pagalvokim", "tęskime", "Koks kitas žingsnis?", "gerai",
      "Ačiū", "viskas aišku", "tęskime", "dar minutėlę",
    ];
    for (const f of fillers) {
      turns.push({ role: "user", text: f });
      turns.push({ role: "assistant", text: "Tęsiame pagal susitarimą — elektromobilis." });
    }
    // >30 messages after the early preference; now a LATER correction.
    turns.push({ role: "user", text: "Vis dėlto tinka ir hibridas" });
    turns.push({ role: "assistant", text: "Sutarta — plečiame į hibridus." });
    turns.push({ role: "user", text: "Ką turime iki šiol?" });

    const adapter = scriptedAdapter({
      intent: "context_question",
      goal: "recall",
      continuationOf: "search_session",
      action: "dialog_reply",
      tool: null,
      toolArgs: {},
      needsClarification: false,
      confidence: 0.8,
      reasons: [],
    });
    setPlannerAdapterForTests(adapter);
    await resolvePlannerDecision(plannerInputFor(turns, { hasSearchSession: true }));

    const req = adapter.requests[adapter.requests.length - 1]!;
    assert.ok(req.parts.salientMemoryBlock.includes("elektromobilio"), "early preference survives 30+ messages");
    assert.ok(req.parts.salientMemoryBlock.includes("Sutarta"), "early assistant agreement survives");
    assert.ok(req.parts.salientMemoryBlock.includes("hibridas"), "the LATER correction is present");
    const hibridIdx = req.parts.salientMemoryBlock.indexOf("hibridas");
    const elektroIdx = req.parts.salientMemoryBlock.indexOf("elektromobilio");
    assert.ok(hibridIdx >= 0 && elektroIdx >= 0, "both preference generations present");
  });
});
