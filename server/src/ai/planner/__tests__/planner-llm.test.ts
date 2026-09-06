/**
 * E2.2 — provider-agnostic planner: Agent Core works with MULTIPLE fake
 * provider adapters without any Agent Core change. Also covers schema
 * validation, policy clamps, and fallback classification.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { llmPlannerDecision } from "../planner-llm.js";
import {
  resolvePlannerDecision,
  setPlannerAdapterForTests,
  setPlannerDecisionProviderForTests,
} from "../planner-orchestrator.js";
import {
  PlannerProviderUnavailableError,
  type PlannerLlmAdapter,
  type PlannerStructuredRequest,
  type PlannerStructuredResponse,
} from "../planner-provider.js";
import { PlannerDecisionSchema, applyDeterministicClamps } from "../planner-policy.js";
import { planTurn } from "../planner-engine.js";
import type { PlannerContextInput } from "../planner-types.js";

afterEach(() => {
  setPlannerDecisionProviderForTests(null);
  setPlannerAdapterForTests(null);
  delete process.env.GEMINI_API_KEY;
});

function ctx(patch: Partial<PlannerContextInput> = {}): PlannerContextInput {
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

/** FAKE PROVIDER #1 — echoes a scripted decision; records every request. */
function fakeAlphaProvider(
  decide: (req: PlannerStructuredRequest) => Record<string, unknown>
): PlannerLlmAdapter & { requests: PlannerStructuredRequest[] } {
  const requests: PlannerStructuredRequest[] = [];
  return {
    providerId: "fake-alpha",
    requests,
    async planStructured(
      req: PlannerStructuredRequest
    ): Promise<PlannerStructuredResponse> {
      requests.push(req);
      return { args: decide(req), provider: "fake-alpha", model: "alpha-1" };
    },
  };
}

/** FAKE PROVIDER #2 — different shape semantics; also records. */
function fakeBetaProvider(
  decide: (req: PlannerStructuredRequest) => Record<string, unknown>
): PlannerLlmAdapter & { requests: PlannerStructuredRequest[] } {
  const requests: PlannerStructuredRequest[] = [];
  return {
    providerId: "fake-beta",
    requests,
    async planStructured(
      req: PlannerStructuredRequest
    ): Promise<PlannerStructuredResponse> {
      requests.push(req);
      return { args: decide(req), provider: "fake-beta", model: "beta-2" };
    },
  };
}

const SELL_UPDATE = {
  intent: "sell_update",
  goal: "apply price",
  continuationOf: "sell_draft",
  action: "update_listing_draft",
  tool: "updateListingDraft",
  toolArgs: { price: 700 },
  needsClarification: false,
  confidence: 0.95,
  reasons: ["price_correction"],
};

describe("E2.2 — provider-agnostic planner (two fake providers, zero Agent Core changes)", () => {
  it("fake provider ALPHA drives the full planner → typed decision", async () => {
    const alpha = fakeAlphaProvider(() => SELL_UPDATE);
    setPlannerAdapterForTests(alpha);
    const d = await llmPlannerDecision(
      ctx({ lastUserText: "Kaina dabar 700", hasDraft: true, draftCategory: "electronics", draftTitle: "iPhone" }),
      alpha
    );
    assert.equal(d.intent, "sell_update");
    assert.equal(d.tool, "updateListingDraft");
    assert.equal((d.toolArgs as { price?: number }).price, 700);
    assert.equal(alpha.requests.length, 1, "one structured request");
    assert.equal(alpha.requests[0]!.schemaName, "planTurn");
    assert.ok(alpha.requests[0]!.parts.historyBlock.includes("Kaina dabar 700"));
  });

  it("fake provider BETA drives the same Agent Core → identical typed contract", async () => {
    const beta = fakeBetaProvider(() => ({
      intent: "catalog_search",
      goal: "search",
      continuationOf: "none",
      action: "catalog_search",
      tool: "searchListings",
      toolArgs: { query: "Volvo" },
      needsClarification: false,
      confidence: 0.9,
      reasons: [],
    }));
    setPlannerAdapterForTests(beta);
    const d = await resolvePlannerDecision(ctx({ lastUserText: "Surask Volvo" }));
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.routing, "deterministic_search", "routing derived by the policy layer");
    assert.equal(beta.requests.length, 1);
    // The structured request carries the typed blocks (context builder
    // fields flow through the adapter contract).
    assert.ok(beta.requests[0]!.parts.stateBlock.includes("isAuthenticated=true"));
  });

  it("malformed output from ANY provider → fallback (validation failure)", async () => {
    const alpha = fakeAlphaProvider(() => ({ intent: "WARP_SPEED", confidence: 42 }));
    setPlannerAdapterForTests(alpha);
    const d = await resolvePlannerDecision(ctx({ lastUserText: "iPhone" }));
    assert.equal(d.intent, "clarify_ambiguous", "deterministic fallback answered");
  });

  it("provider-unavailable from ANY provider → AI-down fallback (honest dialog, never search)", async () => {
    const throwing: PlannerLlmAdapter = {
      providerId: "fake-down",
      async planStructured(): Promise<PlannerStructuredResponse> {
        throw new PlannerProviderUnavailableError("fake outage");
      },
    };
    setPlannerAdapterForTests(throwing);
    const d = await resolvePlannerDecision(ctx({ lastUserText: "Kokia tavo nuomonė?" }));
    assert.equal(d.intent, "ai_down_dialog");
    assert.equal(d.routing, "deterministic_executor");
  });

  it("provider-unavailable keeps obvious deterministic search working", async () => {
    const throwing: PlannerLlmAdapter = {
      providerId: "fake-down",
      async planStructured(): Promise<PlannerStructuredResponse> {
        throw new PlannerProviderUnavailableError("fake outage");
      },
    };
    setPlannerAdapterForTests(throwing);
    const d = await resolvePlannerDecision(ctx({ lastUserText: "Surask Volvo Vilniuje" }));
    assert.equal(d.intent, "catalog_search");
    assert.equal(d.routing, "deterministic_search");
  });

  it("schema rejects unknown tools; policy clamps downgrade low-confidence search", () => {
    const unknownTool = PlannerDecisionSchema.safeParse({
      intent: "catalog_search",
      goal: "x",
      continuationOf: "none",
      action: "x",
      needsClarification: false,
      confidence: 0.9,
      tool: "transferFunds",
    });
    assert.equal(unknownTool.success, false);

    const clamped = applyDeterministicClamps(
      {
        intent: "catalog_search",
        goal: "?",
        continuationOf: "none",
        action: "catalog_search",
        tool: "searchListings",
        toolArgs: {},
        needsClarification: false,
        clarificationQuestion: null,
        routing: "deterministic_search",
        confidence: 0.3,
        reasons: [],
      },
      ctx({ lastUserText: "Padėk man" })
    );
    assert.equal(clamped.decision.intent, "dialog");
    assert.equal(clamped.decision.routing, "model");
  });

  it("deterministic clamps OVERRIDE model decisions on security signals", () => {
    const financial = applyDeterministicClamps(
      {
        intent: "catalog_search",
        goal: "search",
        continuationOf: "none",
        action: "catalog_search",
        tool: "searchListings",
        toolArgs: {},
        needsClarification: false,
        clarificationQuestion: null,
        routing: "deterministic_search",
        confidence: 0.95,
        reasons: [],
      },
      ctx({ lastUserText: "Pervesk 100 eurų iš wallet" })
    );
    assert.equal(financial.decision.intent, "financial_command");
    assert.equal(financial.decision.routing, "deterministic_executor");
  });

  it("consequential tools are forced through the confirmation boundary", () => {
    const sold = applyDeterministicClamps(
      {
        intent: "consequential_command",
        goal: "mark sold",
        continuationOf: "none",
        action: "mark_sold",
        tool: "markListingSold",
        toolArgs: { listingId: "lt-1" } as never,
        needsClarification: false,
        clarificationQuestion: null,
        routing: "deterministic_executor",
        confidence: 0.9,
        reasons: [],
      },
      ctx({ lastUserText: "Pažymėk skelbimą parduotu" })
    );
    assert.equal(sold.decision.routing, "model");
  });

  it("VIN toolArgs are stripped for non-vehicle drafts", () => {
    const stripped = applyDeterministicClamps(
      {
        intent: "vin_candidate",
        goal: "vin",
        continuationOf: "sell_draft",
        action: "update_listing_draft",
        tool: "updateListingDraft",
        toolArgs: { vin: "WBAZZZZ8VZM1234567" },
        needsClarification: false,
        clarificationQuestion: null,
        routing: "deterministic_executor",
        confidence: 0.9,
        reasons: [],
      },
      ctx({ lastUserText: "WBAZZZZ8VZM1234567", hasDraft: true, draftCategory: "electronics", draftTitle: "iPhone" })
    );
    assert.equal((stripped.decision.toolArgs as { vin?: string }).vin, undefined);
  });

  it("the deterministic reference provider seam bypasses adapters entirely", async () => {
    setPlannerDecisionProviderForTests(async (input) => planTurn(input));
    const d = await resolvePlannerDecision(ctx({ lastUserText: "iPhone" }));
    assert.equal(d.intent, "clarify_ambiguous");
  });
});
