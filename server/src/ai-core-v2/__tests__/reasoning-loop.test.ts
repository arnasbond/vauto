/**
 * VAUTO AI Core v2 — the ONE reasoning-loop boundary is composable and
 * legacy-free: it delegates to a provider, imposes no intent enum, no regex,
 * and no forced tool. A single decision may combine state patches, a visible
 * response, a clarification, and a capability request; "no tool" is valid.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  noopReasoningProvider,
  runReasoningLoop,
} from "../reasoning/reasoning-loop.js";
import type {
  ReasoningDecision,
  ReasoningInput,
  ReasoningProvider,
} from "../reasoning/reasoning-contract.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";

function input(userTurn: string): ReasoningInput {
  return {
    userTurn,
    history: [],
    state: emptyMarketplaceState(),
    capabilities: [{ name: "searchListings", description: "ieškoti", operation: "READ" }],
  };
}

describe("Core v2 — composable reasoning decision", () => {
  it("one decision can carry text + state patches + clarification + no tool", async () => {
    const decision: ReasoningDecision = {
      text: "Rekomenduočiau universalą arba hečbeką.",
      statePatches: [
        { op: "setHard", key: "priceMax", value: 20000, provenance: provenance("USER_STATED") },
        { op: "addSoft", label: "saugus", provenance: provenance("MODEL_INFERRED") },
        { op: "addUnresolved", question: "universalas ar hečbekas?" },
      ],
      clarification: "Kuris kėbulo tipas labiau tinka?",
    };
    const provider: ReasoningProvider = async () => decision;
    const out = await runReasoningLoop(provider, input("šeimos automobilis iki 20k"));
    assert.equal(out.text, decision.text);
    assert.equal(out.statePatches?.length, 3);
    assert.equal(out.clarification, decision.clarification);
    assert.equal(out.capabilityRequest, undefined, "no tool chosen");
  });

  it("a decision may request a capability (requested, never executed)", async () => {
    const provider: ReasoningProvider = async () => ({
      capabilityRequest: { capability: "searchListings", args: { category: "real_estate" } },
    });
    const out = await runReasoningLoop(provider, input("surask butus"));
    assert.equal(out.capabilityRequest?.capability, "searchListings");
  });

  it("an empty decision is a deliberate no-tool turn", async () => {
    const provider: ReasoningProvider = async () => ({});
    assert.deepEqual(await runReasoningLoop(provider, input("surask būstą Kaune")), {});
  });

  it("an undefined provider result normalizes to an empty (never-silent no-op)", async () => {
    const provider: ReasoningProvider = async () => undefined;
    assert.deepEqual(await runReasoningLoop(provider, input("labas")), {});
  });

  it("the noop provider is a safe default", async () => {
    assert.deepEqual(await runReasoningLoop(noopReasoningProvider, input("bet kas")), {});
  });

  it("the loop does NOT force search for any wording", async () => {
    const provider: ReasoningProvider = async () => ({}); // model chooses nothing
    const out = await runReasoningLoop(provider, input("surask būstą Kaune iki 150k"));
    assert.equal(out.capabilityRequest, undefined, "no forced search");
  });
});
