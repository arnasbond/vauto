/**
 * VAUTO AI Core v2.3C — state-materialization contract + total turn budget.
 *
 * Deterministic proofs (no network, no credential) of:
 *   A/B/C: text / clarification / capabilityRequest can COEXIST with statePatches;
 *   D/E:   explicit subject / budget stored WITHOUT forcing search;
 *   F:     MODEL_INFERRED can never become executable;
 *   G:     exclusion preserved and never a positive filter;
 *   H:     total turn budget aborts a hung provider and stops iterations;
 *   I:     budget exhaustion is a typed error, never a fabricated success.
 *   (J: non-retryable errors do not retry — covered in provider-robustness.test.ts.)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReasoningDecision } from "../provider/schema.js";
import { applyStatePatches } from "../state/state-transitions.js";
import {
  emptyMarketplaceState,
  provenance,
  executionEligibleHardConstraints,
  executionEligibleSearchSubject,
} from "../state/marketplace-state.js";
import {
  runMultiStepLoop,
  deriveSearchListingsArgs,
  TurnBudgetExceededError,
} from "../loop/multi-step-loop.js";
import type { AuthorityVerifier } from "../loop/authority-verifier.js";
import { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContract } from "../capability/capability.js";
import type { ReasoningInput, ReasoningProvider } from "../reasoning/reasoning-contract.js";

const verifyAll: AuthorityVerifier = async () => "VERIFIED_USER_INTENT";

function readCapability(name: string, data: unknown): CapabilityContract<unknown, unknown> {
  return {
    name,
    description: name,
    operation: "READ",
    validate: (a) => a,
    execute: async () => ({ ok: true, data }),
  };
}

function input(over: Partial<ReasoningInput> = {}): ReasoningInput {
  return {
    userTurn: "surask butus",
    history: [],
    state: emptyMarketplaceState(),
    capabilities: [{ name: "searchListings", description: "ieškoti", operation: "READ" }],
    ...over,
  };
}

describe("Core v2.3C — composable decision contract", () => {
  it("A: text + state patches can coexist", () => {
    const d = parseReasoningDecision({
      text: "Užrašiau biudžetą.",
      statePatches: [{ op: "setHard", key: "priceMax", value: 15000, provenance: { source: "USER_STATED" } }],
    });
    assert.equal(d.text, "Užrašiau biudžetą.");
    assert.equal(d.statePatches?.length, 1);
    const s = applyStatePatches(emptyMarketplaceState(), d.statePatches ?? []);
    assert.equal(s.hardConstraints.priceMax, 15000);
  });

  it("B: clarification + state patches can coexist", () => {
    const d = parseReasoningDecision({
      clarification: "Kokio tipo automobilio?",
      statePatches: [{ op: "setHard", key: "priceMax", value: 15000, provenance: { source: "USER_STATED" } }],
    });
    assert.equal(d.clarification, "Kokio tipo automobilio?");
    assert.equal(d.statePatches?.length, 1);
  });

  it("C: capability request + state patches can coexist", () => {
    const d = parseReasoningDecision({
      capabilityRequest: { capability: "searchListings", args: {} },
      statePatches: [{ op: "setHard", key: "priceMax", value: 15000, provenance: { source: "USER_STATED" } }],
    });
    assert.equal(d.capabilityRequest?.capability, "searchListings");
    assert.equal(d.statePatches?.length, 1);
  });
});

describe("Core v2.3C — materialization without forced execution", () => {
  it("D: explicit subject stored as USER_STATED without forcing search", async () => {
    const provider: ReasoningProvider = async () => ({
      text: "Gerai, ieškau.",
      statePatches: [{ op: "setSearchSubject", subject: "Toyota Corolla", provenance: provenance("USER_STATED") }],
    });
    const registry = new CapabilityRegistry();
    const res = await runMultiStepLoop({ provider, registry, input: input(), authorityVerifier: verifyAll });
    assert.equal(res.capabilityCalls.length, 0, "no search forced");
    assert.equal(executionEligibleSearchSubject(res.finalState), "Toyota Corolla");
  });

  it("E: explicit budget stored as USER_STATED without forcing search", async () => {
    const provider: ReasoningProvider = async () => ({
      text: "Užrašiau 15000.",
      statePatches: [{ op: "setHard", key: "priceMax", value: 15000, provenance: provenance("USER_STATED") }],
    });
    const registry = new CapabilityRegistry();
    const res = await runMultiStepLoop({ provider, registry, input: input(), authorityVerifier: verifyAll });
    assert.equal(res.capabilityCalls.length, 0, "no search forced");
    assert.equal(executionEligibleHardConstraints(res.finalState).priceMax, 15000);
  });

  it("F: MODEL_INFERRED can never become executable", () => {
    let s = emptyMarketplaceState();
    s = applyStatePatches(s, [
      { op: "setHard", key: "priceMax", value: 15000, provenance: provenance("MODEL_INFERRED") },
    ]);
    assert.equal(executionEligibleHardConstraints(s).priceMax, undefined);
    assert.equal(deriveSearchListingsArgs(s, {}).maxPrice, undefined);
  });

  it("G: exclusion preserved and never a positive executable filter", () => {
    let s = emptyMarketplaceState();
    s = applyStatePatches(s, [{ op: "addExclusion", label: "diesel", provenance: provenance("USER_STATED") }]);
    s = applyStatePatches(s, [{ op: "setHard", key: "priceMax", value: 15000, provenance: provenance("USER_STATED") }]);
    assert.equal(s.exclusions.length, 1);
    assert.equal(s.exclusions[0]?.label, "diesel");
    const args = deriveSearchListingsArgs(s, {});
    assert.equal(args.maxPrice, 15000);
    assert.equal(args.category, undefined);
    assert.equal(args.query, undefined);
    assert.equal(Object.values(s.hardConstraints).some((v) => /diesel/i.test(String(v))), false);
  });
});

describe("Core v2.3C — total turn budget", () => {
  it("H: total turn budget aborts a hung provider (no hang)", async () => {
    const provider: ReasoningProvider = () => new Promise(() => {});
    const registry = new CapabilityRegistry();
    await assert.rejects(
      () => runMultiStepLoop({ provider, registry, input: input(), turnBudgetMs: 40 }),
      (e: unknown) => e instanceof TurnBudgetExceededError
    );
  });

  it("H: total turn budget stops further iterations", async () => {
    let calls = 0;
    const provider: ReasoningProvider = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 25));
      return { capabilityRequest: { capability: "searchListings", args: {} } };
    };
    const registry = new CapabilityRegistry();
    registry.register(readCapability("searchListings", { count: 0, listings: [] }));
    await assert.rejects(
      () => runMultiStepLoop({ provider, registry, input: input(), turnBudgetMs: 60, maxIterations: 20 }),
      (e: unknown) => e instanceof TurnBudgetExceededError
    );
    assert.ok(calls < 20, "iterations stopped before the iteration bound");
    assert.ok(calls >= 2, "at least two iterations ran before budget hit");
  });

  it("I: budget exhaustion is a typed error, never a fabricated decision", async () => {
    const provider: ReasoningProvider = () => new Promise(() => {});
    const registry = new CapabilityRegistry();
    let caught: unknown;
    try {
      await runMultiStepLoop({ provider, registry, input: input(), turnBudgetMs: 30 });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof TurnBudgetExceededError);
    assert.equal((caught as TurnBudgetExceededError).code, "turn_budget_exceeded");
  });
});
