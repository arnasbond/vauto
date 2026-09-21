/**
 * VAUTO AI Core v2.3R.1 — Arena foundation + economics tests (no network).
 *
 * Proves provider neutrality (no state mutation / provenance / capability
 * bypass) and corrected unit economics (all attempt costs amortize over
 * successful tasks; verifier/retry/failure costs never disappear).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runArenaCase } from "../arena/run.js";
import { normalizeUsage, normalizeError } from "../arena/normalize.js";
import { toArenaProvider, PROVIDER_ADAPTERS } from "../arena/adapters.js";
import { ARENA_FIXTURES, FIXTURE_G, FIXTURE_K, FIXTURE_Q_PRESERVE } from "../arena/fixtures.js";
import { summarizeArena } from "../arena/metrics.js";
import { freezePriceSnapshot, computeCost } from "../arena/price.js";
import { NO_USAGE, type ArenaProvider, type ArenaRecord, type BillingStatus, type NormalizedError, type ProviderResult, type RequestCost } from "../arena/types.js";
import { emptyMarketplaceState, provenance } from "../state/marketplace-state.js";
import { CapabilityRegistry } from "../capability/registry.js";
import type { CapabilityContract } from "../capability/capability.js";
import type { AuthorityVerifier, AuthorityVerdict } from "../loop/authority-verifier.js";
import type { ReasoningDecision, ReasoningProvider } from "../reasoning/reasoning-contract.js";

function fixedVerifier(verdict: AuthorityVerdict): AuthorityVerifier {
  return async () => verdict;
}
function readCapability(name: string): CapabilityContract<unknown, unknown> {
  return { name, description: name, consequence: "READ", validate: () => ({}), execute: async () => ({ ok: true, data: { count: 0, listings: [] } }) };
}
function registry(): CapabilityRegistry {
  const r = new CapabilityRegistry();
  r.register(readCapability("searchListings"));
  r.register(readCapability("listingDetails"));
  return r;
}
function arenaProvider(decision: ReasoningDecision | null, opts?: { error?: NormalizedError; mutate?: (state: never) => void }): ArenaProvider {
  return async (request) => {
    opts?.mutate?.(request.state as never);
    const base: ProviderResult = { decision, usage: NO_USAGE, latencyMs: 1, attempts: 1, info: { provider: "mock", model: "m" } };
    return opts?.error ? { ...base, decision: null, error: opts.error } : base;
  };
}

function req(role: RequestCost["role"], cost: number | null, billed: BillingStatus = "billed"): RequestCost {
  return { role, usage: { ...NO_USAGE, cost }, billed };
}
function mkRecord(over: Partial<ArenaRecord>): ArenaRecord {
  return {
    provider: "mock", model: "m", scenario: "X", structural: "valid", outcome: "PASS",
    authorityOk: true, capabilityAuthorized: false, executionSafeArgs: {},
    latencyMs: 100, attempts: 1, verifierCalls: 0, cost: { requests: [] }, finalState: emptyMarketplaceState(),
    ...over,
  };
}

describe("Core v2.3R.1 — Arena provider neutrality", () => {
  it("provider cannot directly mutate authoritative MarketplaceState", async () => {
    const provider: ArenaProvider = async (request) => {
      (request.state.hardConstraints as Record<string, unknown>).priceMax = 999999;
      return { decision: {}, usage: NO_USAGE, latencyMs: 1, attempts: 1, info: { provider: "mock", model: "m" } };
    };
    const rec = await runArenaCase({ provider, fixture: FIXTURE_Q_PRESERVE, verifier: fixedVerifier("UNSUPPORTED"), registry: registry() });
    assert.equal(rec.finalState.hardConstraints.priceMax, 20000);
    assert.equal(FIXTURE_Q_PRESERVE.priorState.hardConstraints.priceMax, 20000);
  });

  it("provider cannot assign effective provenance (verifier demotes)", async () => {
    const provider = arenaProvider({ statePatches: [{ op: "setHard", key: "priceMax", value: 15000, provenance: provenance("USER_STATED") }] });
    const rec = await runArenaCase({ provider, fixture: FIXTURE_K, verifier: fixedVerifier("UNSUPPORTED"), registry: registry() });
    assert.equal(rec.finalState.hardConstraintProvenance.priceMax?.source, "MODEL_INFERRED");
  });

  it("provider cannot directly execute capability (non-READ not authorized)", async () => {
    const reg = new CapabilityRegistry();
    reg.register({ name: "publishListing", description: "x", consequence: "CONFIRMATION_REQUIRED", validate: () => ({}), execute: async () => ({ ok: true }) });
    const provider = arenaProvider({ capabilityRequest: { capability: "publishListing", args: {} } });
    const rec = await runArenaCase({ provider, fixture: FIXTURE_G, verifier: fixedVerifier("UNSUPPORTED"), registry: reg });
    assert.equal(rec.capabilityAuthorized, false);
  });

  it("normalizeUsage tolerates missing metrics (never fabricates)", () => {
    const u = normalizeUsage({});
    assert.equal(u.inputTokens, null);
    assert.equal(u.cost, null);
    const u2 = normalizeUsage({ promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 });
    assert.equal(u2.inputTokens, 10);
    assert.equal(u2.outputTokens, 5);
  });

  it("normalizeError classifies timeout/http/malformed/schema consistently", () => {
    assert.deepEqual(normalizeError({ code: "timeout" }), { code: "timeout", retryable: true });
    assert.deepEqual(normalizeError({ code: "http_error", status: 500 }), { code: "http_error", status: 500, retryable: true });
    assert.deepEqual(normalizeError({ code: "schema_invalid" }), { code: "schema_invalid", retryable: false });
  });

  it("fixtures/adapters contain no scenario-specific phrases (no prompt leak)", () => {
    for (const a of PROVIDER_ADAPTERS) {
      for (const phrase of ["Toyota Corolla", "diesel", "15000", "kotedžo"]) {
        assert.ok(!JSON.stringify(a).includes(phrase), `${a.provider} must not embed "${phrase}"`);
      }
    }
    for (const f of ARENA_FIXTURES) {
      assert.equal(typeof f.userTurn, "string");
      assert.ok(f.checks.every((c) => typeof c.pass === "function"));
    }
  });

  it("toArenaProvider preserves the shared contract (decision passthrough)", async () => {
    const raw: ReasoningProvider = async () => ({ text: "hi", statePatches: [{ op: "setGoal", goal: "x" }] });
    const res = await toArenaProvider("mock", "m", raw)({ userTurn: "x", history: [], state: emptyMarketplaceState(), capabilities: [] });
    assert.equal(res.decision?.text, "hi");
    assert.equal(res.info.provider, "mock");
  });
});

describe("Core v2.3R.1 — Arena unit economics", () => {
  it("1: failed paid request contributes to costPerSuccessfulTask", () => {
    const records = [
      mkRecord({ outcome: "PASS", cost: { requests: [req("reasoning", 0.001)] } }),
      mkRecord({ outcome: "NOT_EVALUATED", structural: "http", cost: { requests: [req("reasoning", 0.005)] } }),
    ];
    const s = summarizeArena(records);
    assert.equal(s.costPerSuccessfulTask, 0.006, "failed request cost amortized over the single success");
  });

  it("2: timeout + retry + success are one task, two requests", () => {
    const records = [
      mkRecord({ outcome: "PASS", attempts: 2, cost: { requests: [req("reasoning", 0.001), req("retry", 0.002)] } }),
    ];
    const s = summarizeArena(records);
    assert.equal(s.requestsPerTask, 2);
    assert.equal(s.retriesPerSuccessfulTask, 1);
    assert.equal(s.costPerSuccessfulTask, 0.003);
  });

  it("3: verifier cost contributes to totalTaskCost", () => {
    const records = [
      mkRecord({ outcome: "PASS", cost: { requests: [req("reasoning", 0.001), req("verifier", 0.0005)] } }),
    ];
    const s = summarizeArena(records);
    assert.equal(s.knownCost, 0.0015);
    assert.equal(s.costPerSuccessfulTask, 0.0015);
  });

  it("4: two verifier calls both count", () => {
    const records = [
      mkRecord({ outcome: "PASS", cost: { requests: [req("reasoning", 0.001), req("verifier", 0.0005), req("verifier", 0.0005)] } }),
    ];
    const s = summarizeArena(records);
    assert.equal(s.knownCost, 0.002);
    assert.equal(s.requestsPerTask, 3);
  });

  it("5: zero successful tasks does not produce €0", () => {
    const records = [mkRecord({ outcome: "SEMANTIC_FAIL", cost: { requests: [req("reasoning", 0.005)] } })];
    const s = summarizeArena(records);
    assert.equal(s.knownCost, 0.005);
    assert.equal(s.costPerSuccessfulTask, null, "never €0 / never divide by zero");
  });

  it("6: unknown timeout cost => COST_INCOMPLETE", () => {
    const records = [
      mkRecord({ outcome: "PASS", cost: { requests: [req("reasoning", 0.001)] } }),
      mkRecord({ outcome: "NOT_EVALUATED", structural: "timeout", cost: { requests: [req("reasoning", null, "unknown")] } }),
    ];
    const s = summarizeArena(records);
    assert.equal(s.costIncomplete, true);
    assert.equal(s.unknownCostRequestCount, 1);
    assert.equal(s.costPerSuccessfulTask, null);
  });

  it("7: cheap unreliable model can have worse cost/success than expensive reliable", () => {
    const cheap = [
      mkRecord({ outcome: "PASS", cost: { requests: [req("reasoning", 0.001)] } }),
      mkRecord({ outcome: "SEMANTIC_FAIL", cost: { requests: [req("reasoning", 0.001)] } }),
      mkRecord({ outcome: "NOT_EVALUATED", structural: "timeout", cost: { requests: [req("reasoning", 0.001, "billed")] } }),
      mkRecord({ outcome: "NOT_EVALUATED", structural: "timeout", cost: { requests: [req("reasoning", 0.001, "billed")] } }),
    ];
    const expensive = [
      mkRecord({ outcome: "PASS", cost: { requests: [req("reasoning", 0.002)] } }),
      mkRecord({ outcome: "PASS", cost: { requests: [req("reasoning", 0.002)] } }),
      mkRecord({ outcome: "PASS", cost: { requests: [req("reasoning", 0.002)] } }),
    ];
    const sc = summarizeArena(cheap);
    const se = summarizeArena(expensive);
    assert.equal(sc.costPerSuccessfulTask, 0.004);
    assert.equal(se.costPerSuccessfulTask, 0.002);
    assert.ok(sc.costPerSuccessfulTask! > se.costPerSuccessfulTask!, "cheap unreliable is worse per success");
  });

  it("8: PriceSnapshot is immutable once frozen", () => {
    const p = freezePriceSnapshot({ provider: "x", model: "y", inputPrice: 0.000001, outputPrice: 0.000002, cachedInputPrice: null, reasoningPrice: null, currency: "USD", source: "test", effectiveDate: "2026-01-01", capturedAt: "2026-01-01" });
    assert.throws(() => { (p as { inputPrice: number }).inputPrice = 999; }, TypeError);
    assert.equal(p.inputPrice, 0.000001);
  });

  it("computeCost derives cost from snapshot (null when missing)", () => {
    const p = freezePriceSnapshot({ provider: "x", model: "y", inputPrice: 0.000001, outputPrice: 0.000002, cachedInputPrice: null, reasoningPrice: null, currency: "USD", source: "t", effectiveDate: "2026-01-01", capturedAt: "2026-01-01" });
    const u = { ...NO_USAGE, inputTokens: 1000, outputTokens: 500 };
    assert.equal(computeCost(u, p), 1000 * 0.000001 + 500 * 0.000002);
    assert.equal(computeCost(NO_USAGE, p), null);
  });
});
