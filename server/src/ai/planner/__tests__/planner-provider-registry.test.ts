/**
 * E2.3 — provider REGISTRY/ROUTER integration + durable-memory precedence.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  resolvePlannerDecision,
  resolvePlannerAdapter,
  setPlannerAdapterForTests,
  setPlannerProviderRegistryForTests,
  setPlannerRouteResolverForTests,
  setPlannerDecisionProviderForTests,
} from "../planner-orchestrator.js";
import type { PlannerProviderRegistry } from "../planner-provider-registry.js";
import {
  PlannerProviderUnavailableError,
  type PlannerLlmAdapter,
  type PlannerStructuredRequest,
  type PlannerStructuredResponse,
} from "../planner-provider.js";
import { buildPlannerContext } from "../planner-context-builder.js";

afterEach(() => {
  setPlannerAdapterForTests(null);
  setPlannerProviderRegistryForTests(null);
  setPlannerRouteResolverForTests(null);
  setPlannerDecisionProviderForTests(null);
});

function fakeAdapter(
  id: string,
  decide: (req: PlannerStructuredRequest) => Record<string, unknown>
): PlannerLlmAdapter & { requests: PlannerStructuredRequest[] } {
  const requests: PlannerStructuredRequest[] = [];
  return {
    providerId: id,
    requests,
    async planStructured(req: PlannerStructuredRequest): Promise<PlannerStructuredResponse> {
      requests.push(req);
      return { args: decide(req), provider: id, model: `${id}-model` };
    },
  };
}

describe("E2.3 — provider registry/router", () => {
  it("the router picks fake provider A/B → the REAL orchestrator uses the matching adapter (zero Agent Core changes)", async () => {
    const adapterA = fakeAdapter("fake-a", () => ({
      intent: "catalog_search",
      goal: "a",
      continuationOf: "none",
      action: "catalog_search",
      tool: "searchListings",
      toolArgs: {},
      needsClarification: false,
      confidence: 0.9,
      reasons: ["A"],
    }));
    const adapterB = fakeAdapter("fake-b", () => ({
      intent: "dialog",
      goal: "b",
      continuationOf: "none",
      action: "dialog_reply",
      tool: null,
      toolArgs: {},
      needsClarification: false,
      confidence: 0.5,
      reasons: ["B"],
    }));
    const registry: PlannerProviderRegistry = {
      resolveAdapter(route) {
        if (route.provider === "fake-a") return adapterA;
        if (route.provider === "fake-b") return adapterB;
        throw new PlannerProviderUnavailableError(`no adapter for ${route.provider}`);
      },
    };
    setPlannerProviderRegistryForTests(registry);
    setPlannerRouteResolverForTests(() => ({ provider: "fake-a", model: "a-1" }));

    assert.equal(resolvePlannerAdapter().providerId, "fake-a");
    const dA = await resolvePlannerDecision({ lastUserText: "Surask Volvo", messages: [{ role: "user", text: "Surask Volvo" }], hasDraft: false, isAuthenticated: true, hasSearchSession: false, modelAvailable: true });
    assert.equal(dA.intent, "catalog_search");
    assert.equal(adapterA.requests.length, 1);

    setPlannerRouteResolverForTests(() => ({ provider: "fake-b", model: "b-2" }));
    const dB = await resolvePlannerDecision({ lastUserText: "Labas", messages: [{ role: "user", text: "Labas" }], hasDraft: false, isAuthenticated: true, hasSearchSession: false, modelAvailable: true });
    assert.equal(dB.intent, "dialog");
    assert.equal(adapterB.requests.length, 1);
  });

  it("an UNKNOWN provider route fails CLOSED (never mis-routed to Gemini)", async () => {
    const registry: PlannerProviderRegistry = {
      resolveAdapter(route) {
        if (route.provider !== "gemini") {
          throw new PlannerProviderUnavailableError(`no adapter for ${route.provider}`);
        }
        return fakeAdapter("gemini", () => ({
          intent: "dialog", goal: "", continuationOf: "none", action: "dialog_reply", tool: null, toolArgs: {}, needsClarification: false, confidence: 0.5, reasons: [],
        }));
      },
    };
    setPlannerProviderRegistryForTests(registry);
    setPlannerRouteResolverForTests(() => ({ provider: "openai", model: "gpt-x" }));

    // A non-Gemini model with only a Gemini adapter must fail closed and
    // degrade via AI-down semantics — never reach the Google endpoint.
    const d = await resolvePlannerDecision({ lastUserText: "Kokia tavo nuomonė?", messages: [{ role: "user", text: "Kokia tavo nuomonė?" }], hasDraft: false, isAuthenticated: true, hasSearchSession: false, modelAvailable: true });
    assert.equal(d.intent, "ai_down_dialog");
  });
});

describe("E2.3 — durable memory fact precedence (non-draft)", () => {
  function plannerInputFor(
    messages: Array<{ role: "user" | "assistant"; text: string }>,
    patch: Partial<Parameters<typeof buildPlannerContext>[0]> = {}
  ) {
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

  it("a LATER clear user correction overrides an earlier advisory fact (Vilnius → Kaunas, no draft)", () => {
    const messages: Array<{ role: "user" | "assistant"; text: string }> = [
      { role: "user", text: "Ieškau buto Vilniuje" },
      { role: "assistant", text: "Rodau butus Vilniuje." },
      { role: "user", text: "gal šiek tiek brangiau" },
      { role: "assistant", text: "Gerai." },
      { role: "user", text: "Vis dėlto Kaune" },
    ];
    const input = plannerInputFor(messages);
    assert.equal(input.significantFacts?.city, "Kaunas", "the LATER correction wins");
  });

  it("canonical structured draft ALWAYS wins over advisory memory (draft location suppresses advisory city)", () => {
    const messages: Array<{ role: "user" | "assistant"; text: string }> = [
      { role: "user", text: "Ieškau buto Vilniuje" },
      { role: "assistant", text: "Rodau butus Vilniuje." },
      { role: "user", text: "Vis dėlto Kaune" },
    ];
    const input = plannerInputFor(messages, {
      hasDraft: true,
      draftTitle: "Butas Senamiestyje",
      draftCategory: "real_estate",
      draftLocation: "Vilnius",
    });
    assert.equal(input.significantFacts?.location, "Vilnius", "canonical draft location");
    assert.equal(input.significantFacts?.city, undefined, "advisory city suppressed by the draft");
  });

  it("salient memory keeps long-term goals + preferences the extractors do not capture", () => {
    const messages: Array<{ role: "user" | "assistant"; text: string }> = [
      { role: "user", text: "Noriu tik elektromobilio, ne dyzelio" },
      { role: "assistant", text: "Sutarta — ieškosime elektromobilio." },
      { role: "user", text: "svarbu, kad rida būtų iki 100k" },
      { role: "assistant", text: "Gerai, užfiksavau." },
      { role: "user", text: "Kas toliau?" },
    ];
    const input = plannerInputFor(messages);
    assert.ok(input.salientMemory?.includes("elektromobilio"), "long-term preference survives");
    assert.ok(input.salientMemory?.includes("Sutarta"), "assistant agreement survives");
    assert.ok(input.salientMemory?.includes("rida"), "second preference survives");
  });
});
