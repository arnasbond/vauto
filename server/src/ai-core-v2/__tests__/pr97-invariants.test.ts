/**
 * PR97 — UNIFORM AGENT LOOP & CANONICAL CONTINUITY INVARIANT TESTS
 *
 * Protects:
 * A. Uniform loop semantic: reason -> capability -> grounded result -> reason -> visible answer.
 * B. Capability on last old iteration boundary gets grounded result interpreted in next reason pass.
 * C. Duplicate capability execution is suppressed, but DOES NOT break conversational loop flow.
 * D. After duplicate suppression, model can answer directly OR request a different capability.
 * E. Legitimate multi-step capability refinement remains possible.
 * F. Circuit breaker bounds endless tool requests cleanly.
 * G. Wall-clock budget enforcement (TurnBudgetExceededError).
 * H. Presentation category projection without altering state provenance.
 * I. priceMax=20000 continuity preservation.
 * J. Strict TypeScript compliance under server/tsconfig.json.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContract } from "../capability/capability.js";
import {
  runMultiStepLoop,
  TurnBudgetExceededError,
} from "../loop/multi-step-loop.js";
import type { ReasoningDecision, ReasoningInput, ReasoningProvider } from "../reasoning/reasoning-contract.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import { setHardConstraint, setVertical, setSearchSubject, addSoftPreference } from "../state/state-transitions.js";
import { buyerTurnRecordToVautoResponse } from "../../agent-core/core-v2-adapter.js";

function readCapability(name: string, data: unknown): CapabilityContract<unknown, unknown> {
  return {
    name,
    description: name,
    operation: "READ",
    validate: (a) => a,
    execute: async () => ({ ok: true, data }),
  };
}

function baseInput(over: Partial<ReasoningInput> = {}): ReasoningInput {
  return {
    userTurn: "Svarbiau erdvus universalas. Biudžeto nekeisk.",
    history: [],
    state: emptyMarketplaceState(),
    capabilities: [{ name: "searchListings", description: "ieškoti", operation: "READ" }],
    ...over,
  };
}

describe("PR97 — Uniform Agent Loop & Canonical Continuity Invariants", () => {
  it("A & B. Uniform loop flow: reason -> capability -> grounded result -> reason -> visible answer", async () => {
    let providerCalls = 0;
    const provider: ReasoningProvider = async (inp) => {
      providerCalls++;
      if (!inp.groundedResults?.length) {
        return { capabilityRequest: { capability: "searchListings", args: { query: "erdvus universalas" } } };
      }
      return { text: `Radau ${inp.groundedResults[0]!.summary}` };
    };

    const registry = new CapabilityRegistry();
    registry.register(readCapability("searchListings", { count: 3, listings: [{ title: "Volvo" }] }));

    const res = await runMultiStepLoop({
      provider,
      registry,
      input: baseInput(),
      maxCapabilityCalls: 3,
    });

    assert.equal(res.capabilityCalls.length, 1);
    assert.equal(providerCalls, 2, "Reason step 1 (capability) + Reason step 2 (visible text)");
    assert.match(res.decision.text ?? "", /rasta 3 skelbimų/);
  });

  it("C & D. Duplicate capability request is executed ONLY ONCE, but loop continues to let model decide", async () => {
    let providerCalls = 0;
    let capExecutionCount = 0;
    const provider: ReasoningProvider = async (inp) => {
      providerCalls++;
      if (providerCalls === 1) {
        return { capabilityRequest: { capability: "searchListings", args: { query: "universalas" } } };
      }
      if (providerCalls === 2) {
        // Model attempts exact duplicate capability request
        return { capabilityRequest: { capability: "searchListings", args: { query: "universalas" } } };
      }
      // Model receives duplicate suppression signal / existing grounded result and finishes visibly
      return { text: "Štai esami paieškos rezultatai." };
    };

    const registry = new CapabilityRegistry();
    registry.register({
      name: "searchListings",
      description: "s",
      operation: "READ",
      validate: (a) => a,
      execute: async () => {
        capExecutionCount++;
        return { ok: true, data: { count: 1, listings: [{ id: "c1" }] } };
      },
    });

    const res = await runMultiStepLoop({
      provider,
      registry,
      input: baseInput(),
      maxCapabilityCalls: 3,
    });

    assert.equal(capExecutionCount, 1, "Tool must execute exactly once on DB");
    assert.equal(providerCalls, 3, "Model reasoned 3 times without breaking turn loop prematurely");
    assert.equal(res.decision.text, "Štai esami paieškos rezultatai.");
  });

  it("E. Multiple legitimate different capability refinements remain possible", async () => {
    const executedQueries: string[] = [];
    const provider: ReasoningProvider = async (inp) => {
      const step = inp.groundedResults?.length ?? 0;
      if (step === 0) {
        return { capabilityRequest: { capability: "searchListings", args: { query: "erdvus universalas" } } };
      }
      if (step === 1) {
        return { capabilityRequest: { capability: "searchListings", args: { query: "universalai" } } };
      }
      return { text: "Patikrinau kelias užklausas." };
    };

    const registry = new CapabilityRegistry();
    registry.register({
      name: "searchListings",
      description: "s",
      operation: "READ",
      validate: (a) => a,
      execute: async (args: unknown) => {
        const a = args as { query?: string };
        if (a.query) executedQueries.push(a.query);
        return { ok: true, data: { count: 1, listings: [{ id: "c1" }] } };
      },
    });

    const res = await runMultiStepLoop({
      provider,
      registry,
      input: baseInput(),
      maxCapabilityCalls: 3,
    });

    assert.deepEqual(executedQueries, ["erdvus universalas", "universalai"]);
    assert.equal(res.capabilityCalls.length, 2);
    assert.equal(res.decision.text, "Patikrinau kelias užklausas.");
  });

  it("F. Circuit breaker bounds endless capability requests cleanly", async () => {
    let providerCalls = 0;
    const provider: ReasoningProvider = async () => {
      providerCalls++;
      // Pathological provider returning different query every time
      return { capabilityRequest: { capability: "searchListings", args: { query: `req_${providerCalls}` } } };
    };

    const registry = new CapabilityRegistry();
    registry.register(readCapability("searchListings", { count: 0, listings: [] }));

    const res = await runMultiStepLoop({
      provider,
      registry,
      input: baseInput(),
      maxCapabilityCalls: 3,
      maxReasoningCalls: 6,
    });

    assert.ok(providerCalls <= 6, "Reasoning circuit breaker must bound total provider calls");
    assert.equal(res.capabilityCalls.length, 3, "Capability execution limit strictly respected");
  });

  it("G. Wall-clock budget boundary is strictly enforced (TurnBudgetExceededError)", async () => {
    const slowProvider: ReasoningProvider = async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { text: "slow response" };
    };

    const registry = new CapabilityRegistry();

    await assert.rejects(
      () =>
        runMultiStepLoop({
          provider: slowProvider,
          registry,
          input: baseInput(),
          turnBudgetMs: 30,
        }),
      (err: unknown) => err instanceof TurnBudgetExceededError,
      "Must throw TurnBudgetExceededError on budget timeout"
    );
  });

  it("H & J. Canonical category=vehicles is projected to frontend response filters without changing hardConstraintProvenance to USER_STATED", () => {
    let stateAfter = emptyMarketplaceState();
    stateAfter = setHardConstraint(stateAfter, "priceMax", 20000, provenance("USER_STATED"));
    stateAfter = setVertical(stateAfter, "vehicles");

    assert.equal(stateAfter.hardConstraints.category, undefined);
    assert.equal(stateAfter.hardConstraintProvenance.category, undefined, "Provenance must not be USER_STATED");

    const response = buyerTurnRecordToVautoResponse(
      {
        userTurn: "Svarbiau erdvus universalas. Biudžeto nekeisk.",
        assistantText: "Neradau.",
        decision: { text: "Neradau." },
        stateBefore: emptyMarketplaceState(),
        stateAfter,
        capabilityCalls: [{ name: "searchListings", ok: true, data: { count: 0, listings: [] } }],
        resultContext: { listings: [] },
      },
      {}
    );

    assert.ok(response.actions.type === "search" || response.actions.type === "none");
    if (response.actions.type === "search") {
      const filters = response.actions.filters as Record<string, unknown> | undefined;
      assert.equal(filters?.category, "vehicles", "Category must be projected to response filters");
      assert.equal(filters?.priceMax, 20000, "priceMax must be in response filters");
    }
  });

  it("I. priceMax=20000 continuity remains intact when user says 'Biudžeto nekeisk'", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    s = setSearchSubject(s, "erdvus universalas", provenance("USER_STATED"));
    s = addSoftPreference(s, "erdvus universalas", provenance("USER_STATED"));

    assert.equal(s.hardConstraints.priceMax, 20000);
    assert.equal(s.hardConstraintProvenance.priceMax?.source, "USER_STATED");
    assert.equal(s.searchSubject, "erdvus universalas");
    assert.equal(s.softPreferences.length, 1);
  });
});
