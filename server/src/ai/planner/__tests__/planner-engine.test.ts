/**
 * E2 — planner unit contract: ONE typed decision per turn class.
 *
 * Security/authority classes are verified as REASONING routes only —
 * enforcement stays in the action layer.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planTurn, detectSearchSession } from "../planner-engine.js";
import type { PlannerContextInput } from "../planner-types.js";

function ctx(patch: Partial<PlannerContextInput>): PlannerContextInput {
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

describe("E2 — planner centralization (deterministic reasoning authority)", () => {
  it("sell-continuation facts route to the deterministic field-update capability", () => {
    const cases: Array<{ text: string; key: "price" | "condition" | "city"; value: string | number }> = [
      { text: "Kaina dabar 700", key: "price", value: 700 },
      { text: "Vis dėlto naujas", key: "condition", value: "Nauja" },
      { text: "miestas Vilnius", key: "city", value: "Vilnius" },
      { text: "grąžink 850", key: "price", value: 850 },
    ];
    for (const { text, key, value } of cases) {
      const d = planTurn(ctx({ lastUserText: text, hasDraft: true, draftCategory: "electronics", draftTitle: "iPhone 15 Pro" }));
      assert.equal(d.intent, "sell_update", text);
      assert.equal(d.routing, "deterministic_executor", text);
      assert.equal(d.tool, "updateListingDraft", text);
      assert.equal(d.continuationOf, "sell_draft", text);
      assert.equal((d.toolArgs as Record<string, unknown>)[key], value, text);
    }
  });

  it("cancel / preview / context questions / intent switch on an active draft", () => {
    const cancel = planTurn(ctx({ lastUserText: "Palauk, kol kas neskelbk", hasDraft: true, draftTitle: "iPhone" }));
    assert.equal(cancel.intent, "sell_cancel");
    assert.equal(cancel.routing, "deterministic_executor");

    const preview = planTurn(ctx({ lastUserText: "Parodyk, ką jau turime", hasDraft: true, draftTitle: "iPhone" }));
    assert.equal(preview.intent, "sell_preview");
    assert.equal(preview.routing, "deterministic_executor");

    const question = planTurn(ctx({ lastUserText: "Kokią kainą buvome nustatę?", hasDraft: true, draftTitle: "iPhone" }));
    assert.equal(question.intent, "context_question");
    assert.equal(question.routing, "model");

    const switchSearch = planTurn(ctx({ lastUserText: "Apsigalvojau — ieškok man buto", hasDraft: true, draftTitle: "iPhone" }));
    assert.equal(switchSearch.intent, "catalog_search");
    assert.equal(switchSearch.routing, "model");
  });

  it("bare VIN token on a vehicle draft routes to the VIN candidate capability", () => {
    const d = planTurn(ctx({ lastUserText: "JTDBE32K700123456", hasDraft: true, draftCategory: "vehicles", draftTitle: "BMW 320d" }));
    assert.equal(d.intent, "vin_candidate");
    assert.equal(d.routing, "deterministic_executor");
    assert.equal(d.toolArgs.vin, "JTDBE32K700123456");
  });

  it("policy commands NEVER become catalog searches", () => {
    const financial = planTurn(ctx({ lastUserText: "Pervesk 50 eurų" }));
    assert.equal(financial.intent, "financial_command");
    assert.equal(financial.routing, "deterministic_executor");

    const publish = planTurn(ctx({ lastUserText: "Paskelbk mano skelbimą", isAuthenticated: false }));
    assert.equal(publish.intent, "publish_request");
    assert.equal(publish.routing, "deterministic_executor");

    const consequential = planTurn(ctx({ lastUserText: "Pažymėk skelbimą parduotu" }));
    assert.equal(consequential.routing, "model", "confirmation boundary runs through the model tool loop");
  });

  it("ambiguous single product noun → ONE clarification, never a search", () => {
    const d = planTurn(ctx({ lastUserText: "iPad" }));
    assert.equal(d.intent, "clarify_ambiguous");
    assert.equal(d.routing, "deterministic_executor");
    assert.equal(d.needsClarification, true);
    assert.match(d.clarificationQuestion ?? "", /pirkti ar parduoti/);
  });

  it("search corrections with a prior search session route to the model tool loop", () => {
    const input = ctx({ lastUserText: "Ne, ne Vilniuje — Kaune" });
    input.messages = [
      { role: "user", text: "Ieškok Volvo Vilniuje" },
      { role: "assistant", text: "…" },
      { role: "user", text: "Ne, ne Vilniuje — Kaune" },
    ];
    assert.equal(detectSearchSession(input.messages, input.lastUserText), true);
    input.hasSearchSession = true;
    const d = planTurn(input);
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.routing, "model");
  });

  it("simple catalog queries stay on the deterministic search fast-path", () => {
    const d = planTurn(ctx({ lastUserText: "Surask Volvo V70 Vilniuje" }));
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.routing, "deterministic_search");
  });

  it("E2.1 — no default 'everything else = search'; unclear intent is dialog", () => {
    for (const text of ["Man reikia patarimo", "Aš persigalvojau", "Padėk man", "Papasakok daugiau"]) {
      const d = planTurn(ctx({ lastUserText: text }));
      assert.notEqual(d.intent, "catalog_search", text);
      assert.equal(d.routing, "model", text);
      assert.equal(d.intent, "dialog", text);
    }
  });

  it("E2.8 — uncertainty phrases are discovery/advisory, not plain dialog", () => {
    const d = planTurn(ctx({ lastUserText: "Nežinau nuo ko pradėti" }));
    assert.equal(d.intent, "context_question");
    assert.equal(d.routing, "model");
    assert.equal(d.advisoryContext, true);
    assert.notEqual(d.intent, "catalog_search");
  });

  it("E2.1 — AI-down: obvious search keeps the deterministic capability; unclear becomes honest dialog", () => {
    const search = planTurn(ctx({ lastUserText: "Surask Volvo Vilniuje", modelAvailable: false }));
    assert.equal(search.routing, "deterministic_search");
    assert.equal(search.intent, "catalog_search");

    const unclear = planTurn(ctx({ lastUserText: "Kokia tavo nuomonė?", modelAvailable: false }));
    assert.equal(unclear.intent, "ai_down_dialog");
    assert.equal(unclear.routing, "deterministic_executor");
    assert.equal(unclear.tool, null);
  });

  it("E2.1 — high-confidence fast-paths only: structured facets stay a search; plain nouns do not", () => {
    const facets = planTurn(ctx({ lastUserText: "butas Vilniuje iki 120000 eur, 3 kambariai" }));
    assert.equal(facets.intent, "catalog_search");
    assert.equal(facets.routing, "deterministic_search");

    const browseAll = planTurn(ctx({ lastUserText: "Parodyk viską" }));
    assert.equal(browseAll.routing, "deterministic_search");
  });

  it("authenticated publish keeps the pre-E2 readiness flow (fallthrough)", () => {
    const d = planTurn(ctx({ lastUserText: "Publikuok", hasDraft: true, draftTitle: "iPhone", isAuthenticated: true }));
    assert.equal(d.intent, "publish_request");
    assert.equal(d.routing, "fallthrough");
  });
});
