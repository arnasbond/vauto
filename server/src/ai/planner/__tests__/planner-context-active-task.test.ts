/**
 * R4.3C — active conversational task / subject visibility (deterministic, no model).
 *
 * Proves the planner context carries enough structured active-task state (the
 * current goal + the active listing draft / search subject as canonical facts)
 * so the semantic model can reason over CONTINUE / REFINE / CORRECT / SWITCH
 * without reconstructing it from raw previous text. No phrase rules.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlannerContext } from "../planner-context-builder.js";

function base(overrides: Partial<Parameters<typeof buildPlannerContext>[0]> = {}) {
  return buildPlannerContext({
    messages: [{ role: "user", text: "su 4 kėdėmis, ąžuolas" }],
    lastUserText: "su 4 kėdėmis, ąžuolas",
    hasDraft: false,
    isAuthenticated: true,
    hasSearchSession: false,
    modelAvailable: true,
    ...overrides,
  });
}

describe("R4.3C — active task / subject visibility", () => {
  it("an active listing draft is surfaced as the current goal + canonical facts", () => {
    const input = base({
      hasDraft: true,
      draftTitle: "Medinis stalas",
      draftCategory: "home",
      draftPrice: 150,
      draftLocation: "Vilnius",
      flowState: "DRAFT_READY",
      currentIntent: "pardavimo skelbimas: Medinis stalas",
    });
    assert.equal(input.currentGoal, "pardavimo skelbimas: Medinis stalas");
    assert.equal(input.hasDraft, true);
    assert.equal(input.significantFacts?.title, "Medinis stalas");
    assert.equal(input.significantFacts?.category, "home");
    assert.equal(input.significantFacts?.price, "150");
  });

  it("an active search is surfaced as a structured subject/object fact", () => {
    const input = base({
      hasSearchSession: true,
      currentIntent: "prekių paieška: volvo",
      activeSearchFilters: { query: "volvo", category: "vehicles", maxPrice: 10000 },
    });
    assert.equal(input.currentGoal, "prekių paieška: volvo");
    assert.equal(input.significantFacts?.searchQuery, "volvo");
    assert.equal(input.significantFacts?.searchCategory, "vehicles");
    assert.equal(input.significantFacts?.searchMaxPrice, "10000");
  });

  it("no active task → empty goal and no stale subject facts", () => {
    const input = base({});
    assert.equal(input.currentGoal, "");
    assert.equal(input.significantFacts?.searchQuery, undefined);
    assert.equal(input.significantFacts?.title, undefined);
  });
});
