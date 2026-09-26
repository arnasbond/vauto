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
  PersistentDuplicateCapabilityError,
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
    // A provider that always requests a capability -> the loop stops at the bound.
    const provider: ReasoningProvider = async () => ({
      capabilityRequest: { capability: "searchListings", args: {} },
    });
    const registry = new CapabilityRegistry();
    registry.register(readCapability("searchListings", { count: 0, listings: [] }));
    const res = await runMultiStepLoop({ provider, registry, input: input(), maxIterations: 2 });
    assert.equal(res.iterations, 2);
    assert.ok(res.iterations <= DEFAULT_MAX_ITERATIONS);
  });

  describe("analyzePhoto summary formatting & generic duplicate capability handling", () => {
    it("1. analyzePhoto summary contains actual grounded facts rather than 'ok'", async () => {
      const registry = new CapabilityRegistry();
      registry.register({
        name: "analyzePhoto",
        description: "analizuoti",
        operation: "READ",
        validate: (a) => a,
        execute: async () => ({
          ok: true,
          provenance: "VISION_DERIVED",
          data: {
            detectedObjects: ["Toyota Yaris"],
            category: "vehicles",
            titleCandidate: "Toyota Yaris 2018",
            descriptionCandidate: "Tvarkingas automobilis",
            price: 8500,
            attributes: { make: "Toyota", model: "Yaris" },
          },
        }),
      });

      let capturedGroundedSummary = "";
      const provider: ReasoningProvider = async (inp) => {
        if (!inp.groundedResults?.length) {
          return { capabilityRequest: { capability: "analyzePhoto", args: {} } };
        }
        capturedGroundedSummary = inp.groundedResults[0]!.summary ?? "";
        return { text: "Nuotrauka išanalizuota." };
      };

      const res = await runMultiStepLoop({ provider, registry, input: input() });
      assert.strictEqual(res.iterations, 2);
      assert.ok(capturedGroundedSummary.includes("[VISION_DERIVED]"));
      assert.ok(capturedGroundedSummary.includes("objektai: Toyota Yaris"));
      assert.ok(capturedGroundedSummary.includes("kategorija: vehicles"));
      assert.ok(capturedGroundedSummary.includes("pavadinimas: Toyota Yaris 2018"));
      assert.ok(capturedGroundedSummary.includes("kaina: 8500 €"));
      assert.ok(capturedGroundedSummary.includes("savybės: make: Toyota, model: Yaris"));
    });

    it("2. missing vision fields remain missing, not invented", async () => {
      const registry = new CapabilityRegistry();
      registry.register({
        name: "analyzePhoto",
        description: "analizuoti",
        operation: "READ",
        validate: (a) => a,
        execute: async () => ({
          ok: true,
          provenance: "DOCUMENT_DERIVED",
          data: {
            detectedObjects: ["Dviratis"],
            isDocument: true,
          },
        }),
      });

      let capturedGroundedSummary = "";
      const provider: ReasoningProvider = async (inp) => {
        if (!inp.groundedResults?.length) {
          return { capabilityRequest: { capability: "analyzePhoto", args: {} } };
        }
        capturedGroundedSummary = inp.groundedResults[0]!.summary ?? "";
        return { text: "Dokumentas išanalizuotas." };
      };

      await runMultiStepLoop({ provider, registry, input: input() });
      assert.ok(capturedGroundedSummary.includes("[DOCUMENT_DERIVED]"));
      assert.ok(capturedGroundedSummary.includes("objektai: Dviratis"));
      assert.strictEqual(capturedGroundedSummary.includes("kaina:"), false);
      assert.strictEqual(capturedGroundedSummary.includes("savybės:"), false);
      assert.strictEqual(capturedGroundedSummary.includes("kategorija:"), false);
    });

    it("3. identical duplicate capability is not executed twice and guidance note is injected", async () => {
      let executionCount = 0;
      const registry = new CapabilityRegistry();
      registry.register({
        name: "searchListings",
        description: "ieškoti",
        operation: "READ",
        validate: (a) => a,
        execute: async () => {
          executionCount++;
          return { ok: true, data: { count: 1, listings: [{ title: "Auto" }] } };
        },
      });

      let passCount = 0;
      let pass3Notice = "";
      const provider: ReasoningProvider = async (inp) => {
        passCount++;
        if (passCount === 1) {
          return { capabilityRequest: { capability: "searchListings", args: { query: "auto" } } };
        }
        if (passCount === 2) {
          // Model attempts duplicate capability request
          return { capabilityRequest: { capability: "searchListings", args: { query: "auto" } } };
        }
        // Pass 3: provider is re-invoked with guidance note in groundedResults
        pass3Notice = inp.groundedResults?.find((g) => g.summary?.includes("PASTABA"))?.summary ?? "";
        return { text: "Gauti rezultatai patvirtinti." };
      };

      const res = await runMultiStepLoop({ provider, registry, input: input() });
      assert.strictEqual(executionCount, 1, "Capability execute must be called ONLY ONCE");
      assert.ok(pass3Notice.includes("JAU įvykdytas šiame turne"), "Duplicate guidance note must be present in grounded results on pass 3");
      assert.strictEqual(res.decision.text, "Gauti rezultatai patvirtinti.");
    });

    it("4. persistent duplicate requests terminate boundedly via PersistentDuplicateCapabilityError circuit breaker", async () => {
      let executionCount = 0;
      const registry = new CapabilityRegistry();
      registry.register({
        name: "searchListings",
        description: "ieškoti",
        operation: "READ",
        validate: (a) => a,
        execute: async () => {
          executionCount++;
          return { ok: true, data: { count: 0, listings: [] } };
        },
      });

      // A stubborn provider that ignores guidance and repeatedly requests identical capability
      const provider: ReasoningProvider = async () => ({
        capabilityRequest: { capability: "searchListings", args: { query: "same" } },
      });

      await assert.rejects(
        async () => {
          await runMultiStepLoop({ provider, registry, input: input() });
        },
        (err: unknown) => {
          assert.ok(err instanceof PersistentDuplicateCapabilityError);
          assert.strictEqual(err.code, "persistent_duplicate_capability");
          assert.strictEqual(err.capability, "searchListings");
          return true;
        },
        "Must throw PersistentDuplicateCapabilityError on persistent duplicate request"
      );
      assert.strictEqual(executionCount, 1, "Capability execute must be called ONLY ONCE");
    });

    it("5. terminal duplicate error path does NOT fall through as normal decision or core_v2_empty_visible_response", async () => {
      const registry = new CapabilityRegistry();
      registry.register({
        name: "analyzePhoto",
        description: "analizuoti",
        operation: "READ",
        validate: (a) => a,
        execute: async () => ({ ok: true, data: { detectedObjects: ["Car"] } }),
      });

      const provider: ReasoningProvider = async () => ({
        capabilityRequest: { capability: "analyzePhoto", args: {} },
      });

      try {
        await runMultiStepLoop({ provider, registry, input: input() });
        assert.fail("Should have thrown PersistentDuplicateCapabilityError");
      } catch (err) {
        assert.ok(err instanceof PersistentDuplicateCapabilityError);
        assert.notStrictEqual(
          (err as Error).message,
          "core_v2_empty_visible_response",
          "Must NOT fall through to core_v2_empty_visible_response"
        );
      }
    });
  });
});

describe("Core v2 — execution-safe search args", () => {
  it("hard filters come only from USER_INTENT state; model query is ignored", () => {
    let s = emptyMarketplaceState();
    s = setHardConstraint(s, "priceMax", 150000, provenance("USER_STATED"));
    s = setHardConstraint(s, "category", "real_estate", provenance("MODEL_INFERRED", 0.7));
    s = setHardConstraint(s, "location", "Vilnius", provenance("USER_STATED"));

    const args = deriveSearchListingsArgs(s, { query: "butas", category: "vehicles", maxPrice: 999999 });
    assert.equal(args.query, "butas", "validated query passed when eligibleSubject is unset");
    assert.equal(args.maxPrice, 150000, "user-stated budget wins");
    assert.equal(args.category, "vehicles", "model args passed when eligible category is unset");
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
