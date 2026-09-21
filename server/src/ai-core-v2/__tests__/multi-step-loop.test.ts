/**
 * VAUTO AI Core v2 — multi-step loop: model is the semantic authority, tools
 * are bounded READ capabilities, capability results are interpreted by the
 * model (never auto-answered).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContract } from "../capability/capability.js";
import {
  runMultiStepLoop,
  deriveSearchListingsArgs,
  DEFAULT_MAX_ITERATIONS,
} from "../loop/multi-step-loop.js";
import type { ReasoningDecision, ReasoningInput, ReasoningProvider } from "../reasoning/reasoning-contract.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import { setHardConstraint } from "../state/state-transitions.js";

function scriptedProvider(decisions: ReasoningDecision[]): ReasoningProvider {
  let i = 0;
  return async () => decisions[Math.min(i++, decisions.length - 1)] ?? {};
}

function readCapability(
  name: string,
  data: unknown
): CapabilityContract<unknown, unknown> {
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
    userTurn: "surask butus Kaune",
    history: [],
    state: emptyMarketplaceState(),
    capabilities: [{ name: "searchListings", description: "ieškoti", operation: "READ" }],
    ...over,
  };
}

describe("Core v2 — multi-step loop", () => {
  it("no-tool turn finishes after one reasoning pass", async () => {
    const provider = scriptedProvider([{ text: "patarimas" }]);
    const registry = new CapabilityRegistry();
    const res = await runMultiStepLoop({ provider, registry, input: input() });
    assert.equal(res.iterations, 1);
    assert.equal(res.decision.text, "patarimas");
    assert.equal(res.capabilityCalls.length, 0);
  });

  it("model requests a READ capability, receives grounded result, then interprets it", async () => {
    const calls: string[] = [];
    const provider: ReasoningProvider = async (inp) => {
      calls.push(inp.userTurn);
      if (!inp.groundedResults?.length) {
        return { capabilityRequest: { capability: "searchListings", args: { query: "butas" } } };
      }
      // Model interprets the grounded result.
      return { text: `Radau variantų: ${inp.groundedResults[0]!.summary}` };
    };
    const registry = new CapabilityRegistry();
    registry.register(readCapability("searchListings", { count: 2, listings: [{ title: "Butas A" }, { title: "Butas B" }] }));
    const res = await runMultiStepLoop({ provider, registry, input: input() });
    assert.equal(res.iterations, 2, "reasoning + capability + final reasoning");
    assert.equal(res.capabilityCalls.length, 1);
    assert.equal(res.capabilityCalls[0]!.ok, true);
    assert.match(res.decision.text ?? "", /Butas A/);
  });

  it("a CONSEQUENTIAL capability request surfaces confirmation without execution", async () => {
    const provider = scriptedProvider([
      { capabilityRequest: { capability: "publishListing", args: {} } },
    ]);
    const registry = new CapabilityRegistry();
    registry.register({
      name: "publishListing",
      description: "x",
      operation: "CONSEQUENTIAL",
      validate: (a) => a,
      execute: async () => ({ ok: true }),
    });
    const res = await runMultiStepLoop({ provider, registry, input: input() });
    assert.equal(res.capabilityCalls.length, 1);
    assert.equal(res.capabilityCalls[0]!.ok, false);
    assert.equal(res.capabilityCalls[0]!.error, "confirmation_required");
  });

  it("an unknown capability is rejected", async () => {
    const provider = scriptedProvider([{ capabilityRequest: { capability: "nope", args: {} } }]);
    const registry = new CapabilityRegistry();
    const res = await runMultiStepLoop({ provider, registry, input: input() });
    assert.equal(res.capabilityCalls[0]!.error, "unknown_capability");
  });

  it("the loop is bounded (never an autonomous infinite agent)", async () => {
    // A provider that always requests a capability → the loop stops at the bound.
    const provider: ReasoningProvider = async () => ({
      capabilityRequest: { capability: "searchListings", args: {} },
    });
    const registry = new CapabilityRegistry();
    registry.register(readCapability("searchListings", { count: 0, listings: [] }));
    const res = await runMultiStepLoop({ provider, registry, input: input(), maxIterations: 2 });
    assert.equal(res.iterations, 2);
    assert.ok(res.iterations <= DEFAULT_MAX_ITERATIONS);
  });
});

describe("Core v2 — execution-safe search args", () => {
  it("hard filters come only from USER_INTENT state; model query is ignored", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 150000, provenance("USER_STATED"));
    s = setHardConstraint(s, "category", "real_estate", provenance("MODEL_INFERRED", 0.7));
    s = setHardConstraint(s, "location", "Vilnius", provenance("USER_STATED"));

    const args = deriveSearchListingsArgs(s, { query: "butas", category: "vehicles", maxPrice: 999999 });
    assert.equal(args.query, undefined, "model-invented query is not execution authority");
    assert.equal(args.maxPrice, 150000, "user-stated budget wins");
    assert.equal(args.category, undefined, "model-inferred category excluded");
    assert.equal(args.city, "Vilnius", "user-stated location included");
  });

  it("soft preferences never become hard filters", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 20000, provenance("USER_STATED"));
    const args = deriveSearchListingsArgs(s, { query: "auto" });
    assert.equal(args.maxPrice, 20000);
    assert.equal(args.category, undefined);
  });
});
