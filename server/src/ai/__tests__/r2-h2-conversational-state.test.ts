/**
 * R2-H2 — conversational constraints must survive an advisory turn and be
 * materializable into a later retrieval. This is a STATE + REASONING fix,
 * never a phrase dictionary.
 *
 * Deterministic coverage:
 *  - an advisory turn's object/category/budget are surfaced as structured facts;
 *  - the memory hint + planner instruction direct the model to RESOLVE a
 *    reference ("pagal aptartas sąlygas") to the established state instead of
 *    treating it as a fresh empty/browse query.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlannerContext } from "../planner/planner-context-builder.js";
import { AGENT_MEMORY_SYSTEM_HINT } from "../agent-memory-context.js";
import { buildPlannerStructuredRequest } from "../planner/planner-llm.js";
import type { PlannerContextInput } from "../planner/planner-types.js";

function plannerInput(lastUserText: string, messages: Array<{ role: "user" | "assistant"; text: string }>): PlannerContextInput {
  return {
    messages,
    lastUserText,
    hasDraft: false,
    isAuthenticated: true,
    hasSearchSession: false,
    modelAvailable: true,
  };
}

describe("R2-H2 — advisory turn surfaces marketplace facts", () => {
  it("category + budget are extracted as structured facts from an advisory vehicle need", () => {
    const input = buildPlannerContext({
      messages: [
        {
          role: "user",
          text: "noriu automobilio žmonai, du maži vaikai, biudžetas iki 20000 eur, miestui, svarbu saugumas",
        },
      ],
      lastUserText: "noriu automobilio žmonai, du maži vaikai, biudžetas iki 20000 eur, miestui, svarbu saugumas",
      hasDraft: false,
      isAuthenticated: true,
      hasSearchSession: false,
      modelAvailable: true,
    });
    assert.equal(input.significantFacts?.category, "vehicles", "object category is a fact");
    assert.equal(input.significantFacts?.price, "20000", "budget is a fact");
  });

  it("an advisory electronics need surfaces the electronics category", () => {
    const input = buildPlannerContext({
      messages: [{ role: "user", text: "reikia telefono vaikui, iki 300 eur" }],
      lastUserText: "reikia telefono vaikui, iki 300 eur",
      hasDraft: false,
      isAuthenticated: true,
      hasSearchSession: false,
      modelAvailable: true,
    });
    assert.equal(input.significantFacts?.category, "electronics", "phone category is a fact");
    assert.equal(input.significantFacts?.price, "300", "budget is a fact");
  });
});

describe("R2-H2 — reference resolution is directed by the prompts", () => {
  it("memory hint directs resolving an established subject instead of a fresh browse", () => {
    assert.match(AGENT_MEMORY_SYSTEM_HINT, /IŠSPRĘSK objektą, kategoriją ir kainos rėžius/i);
    assert.match(AGENT_MEMORY_SYSTEM_HINT, /automobilis→vehicles/i);
  });

  it("planner instruction directs resolving a reference to facts/history (not browse-all)", () => {
    const req = buildPlannerStructuredRequest(plannerInput("parodyk pagal aptartas sąlygas", []));
    assert.match(req.systemInstruction, /NUORODA Į ANKSTESNĮ OBJEKTĄ/i);
    assert.match(req.systemInstruction, /NE browse-all/i);
  });
});
