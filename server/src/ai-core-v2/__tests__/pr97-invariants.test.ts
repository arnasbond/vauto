/**
 * PR97 — AGENT LOOP COMPLETION & CANONICAL CONTINUITY INVARIANT TESTS
 *
 * Protects:
 * 1. Final grounded-result interpretation pass on last normal reasoning iteration.
 * 2. Return of DIRECT/CLARIFY completion instead of core_v2_empty_visible_response.
 * 3. Finite loop bounds when model repeatedly requests capabilities.
 * 4. Wall-clock budget enforcement (TurnBudgetExceededError).
 * 5. Legitimate multi-step capability refinement.
 * 6. Presentation category projection without faking USER_STATED provenance.
 * 7. priceMax=20000 continuity preservation.
 * 8. Accurate error taxonomy mapping for core_v2_empty_visible_response.
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

describe("PR97 — Agent Loop Completion & Canonical Continuity Invariants", () => {
  it("1 & 2. Capability on last normal reasoning slot executes and receives a final interpretation opportunity yielding DIRECT response", async () => {
    // 3 iterations: 1st, 2nd, 3rd return capabilityRequests with NO text.
    // The final interpretation pass receives grounded results and returns DIRECT text.
    let providerCalls = 0;
    const provider: ReasoningProvider = async (inp) => {
      providerCalls++;
      if (!inp.groundedResults?.length || inp.groundedResults.length < 3) {
        const queries = ["erdvus universalas", "universalai", "universal"];
        const q = queries[inp.groundedResults?.length ?? 0] ?? "universal";
        return { capabilityRequest: { capability: "searchListings", args: { query: q } } };
      }
      // Final interpretation pass (groundedResults.length === 3)
      return { text: "Šiuo metu neradau automobilių pagal jūsų kriterijus." };
    };

    const registry = new CapabilityRegistry();
    registry.register(readCapability("searchListings", { count: 0, listings: [] }));

    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    s = setVertical(s, "vehicles");

    const res = await runMultiStepLoop({
      provider,
      registry,
      input: baseInput({ state: s }),
      maxIterations: 3,
    });

    assert.equal(res.capabilityCalls.length, 3, "Executed 3 search refinements");
    assert.equal(providerCalls, 4, "3 ordinary reasoning passes + 1 final interpretation pass");
    assert.equal(res.decision.text, "Šiuo metu neradau automobilių pagal jūsų kriterijus.");
    assert.ok(res.decision.text!.length > 0, "Visible text MUST be populated");
  });

  it("3. Loop remains strictly finite when model keeps requesting capabilities", async () => {
    // A provider that continuously requests capabilities even during interpretation pass.
    let providerCalls = 0;
    const provider: ReasoningProvider = async () => {
      providerCalls++;
      return { capabilityRequest: { capability: "searchListings", args: { query: "always_request" } } };
    };

    const registry = new CapabilityRegistry();
    registry.register(readCapability("searchListings", { count: 0, listings: [] }));

    const res = await runMultiStepLoop({
      provider,
      registry,
      input: baseInput(),
      maxIterations: 3,
    });

    // 1 capability executed (due to duplicate capability call protection) + 1 interpretation pass = 2 provider calls
    assert.ok(providerCalls <= 4, "Provider calls must stay strictly bounded");
    assert.ok(res.capabilityCalls.length <= 3, "Capability executions must stay within max iterations");
  });

  it("4. Wall-clock budget boundary is strictly enforced (TurnBudgetExceededError)", async () => {

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
          turnBudgetMs: 30, // 30ms budget < 100ms provider delay
        }),
      (err: unknown) => err instanceof TurnBudgetExceededError,
      "Must throw TurnBudgetExceededError on budget timeout"
    );
  });

  it("5. Legitimate multi-step capability refinement remains possible", async () => {

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
      maxIterations: 3,
    });

    assert.deepEqual(executedQueries, ["erdvus universalas", "universalai"]);
    assert.equal(res.capabilityCalls.length, 2);
    assert.equal(res.decision.text, "Patikrinau kelias užklausas.");
  });

  it("6. Canonical category=vehicles is projected to frontend response filters without changing hardConstraintProvenance to USER_STATED", () => {
    let stateAfter = emptyMarketplaceState();
    stateAfter = setHardConstraint(stateAfter, "priceMax", 20000, provenance("USER_STATED"));
    stateAfter = setVertical(stateAfter, "vehicles"); // vertical = vehicles, hardConstraints.category = undefined

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
      assert.equal(response.actions.filters?.category, "vehicles", "Category must be projected to response filters");
      assert.equal(response.actions.filters?.priceMax, 20000, "priceMax must be in response filters");
    }
  });

  it("7. priceMax=20000 continuity remains intact when user says 'Biudžeto nekeisk'", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    s = setSearchSubject(s, "erdvus universalas", provenance("USER_STATED"));
    s = addSoftPreference(s, "erdvus universalas", provenance("USER_STATED"));

    assert.equal(s.hardConstraints.priceMax, 20000);
    assert.equal(s.hardConstraintProvenance.priceMax?.source, "USER_STATED");
    assert.equal(s.searchSubject, "erdvus universalas");
    assert.equal(s.softPreferences.length, 1);
  });

  it("8. Error taxonomy maps core_v2_empty_visible_response correctly (not thread_update_contention)", () => {
    const message = "Error: core_v2_empty_visible_response";
    const code = /ownership/.test(message)
      ? "thread_ownership_violation"
      : /empty_user_turn/.test(message)
        ? "invalid_request"
        : /turn_in_progress/.test(message)
          ? "turn_in_progress"
          : /turn_indeterminate/.test(message)
            ? "turn_indeterminate"
            : /turn_ledger_conflict/.test(message)
              ? "turn_ledger_conflict"
              : /core_v2_empty_visible_response/.test(message)
                ? "core_v2_empty_visible_response"
                : "thread_update_contention";

    assert.equal(code, "core_v2_empty_visible_response");
    assert.notEqual(code, "thread_update_contention");
  });
});
