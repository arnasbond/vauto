/**
 * VAUTO AI Core v2.3R.4 — Arena fairness + OpenRouter lab transport (mocked HTTP).
 * No network. Proves routing lock, identity validation, retry normalization,
 * canonical validation, and OpenRouter cost capture.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOpenRouterTransport, createGeminiTransport, canonicalContractValid } from "../arena/transports.js";
import { summarizeArena } from "../arena/metrics.js";
import { CORE_V2_MAX_REASONING_ATTEMPTS } from "../provider/model-config.js";
import { NO_USAGE, type ArenaRecord, type RequestCost } from "../arena/types.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";
import type { ReasoningInput } from "../reasoning/reasoning-contract.js";

const inp: ReasoningInput = { userTurn: "ieškau", history: [], state: emptyMarketplaceState(), capabilities: [] };

function jsonResponse(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}
function req(role: RequestCost["role"], cost: number | null, billed: RequestCost["billed"] = "billed"): RequestCost {
  return { role, usage: { ...NO_USAGE, cost }, billed };
}
function mkRecord(over: Partial<ArenaRecord>): ArenaRecord {
  return { provider: "m", model: "m", scenario: "X", structural: "valid", outcome: "PASS", authorityOk: true, capabilityAuthorized: false, executionSafeArgs: {}, latencyMs: 100, attempts: 1, verifierCalls: 0, cost: { requests: [] }, finalState: emptyMarketplaceState(), ...over };
}

describe("Core v2.3R.4 — OpenRouter routing lock", () => {
  it("sends exact requested model + provider allowlist + no fallback", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: unknown, init: unknown) => {
      body = JSON.parse((init as { body: string }).body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "deepseek/deepseek-flash", provider: "deepseek" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await createOpenRouterTransport({ model: "deepseek/deepseek-flash", upstreamProvider: "deepseek", apiKey: "test", fetchImpl }).call(inp);
    assert.equal(body.model, "deepseek/deepseek-flash");
    const p = body.provider as Record<string, unknown>;
    assert.deepEqual(p.only, ["deepseek"]);
    assert.equal(p.allow_fallbacks, false);
    assert.equal(p.require_parameters, true);
    assert.equal(p.data_collection, "deny", "data_collection nested inside provider");
    assert.equal("models" in body, false, "no model fallback array");
    assert.equal("data_collection" in body, false, "top-level data_collection must not exist");
    assert.equal("zdr" in body, false, "top-level zdr must not exist");
  });

  it("returned model mismatch => transport_invalid", async () => {
    const fetchImpl = jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "other/model", provider: "deepseek" });
    const res = await createOpenRouterTransport({ model: "deepseek/deepseek-flash", upstreamProvider: "deepseek", apiKey: "test", fetchImpl }).call(inp);
    assert.equal(res.error?.code, "transport_invalid");
    assert.equal(res.transportIdentity?.requestedModel, "deepseek/deepseek-flash");
    assert.equal(res.transportIdentity?.returnedModel, "other/model");
  });

  it("returned provider mismatch => transport_invalid", async () => {
    const fetchImpl = jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "deepseek/deepseek-flash", provider: "mistralai" });
    const res = await createOpenRouterTransport({ model: "deepseek/deepseek-flash", upstreamProvider: "deepseek", apiKey: "test", fetchImpl }).call(inp);
    assert.equal(res.error?.code, "transport_invalid");
  });

  it("Mistral lock nests data_collection inside provider (exact shape)", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: unknown, init: unknown) => {
      body = JSON.parse((init as { body: string }).body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "mistralai/mistral-small-2603", provider: "Mistral" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await createOpenRouterTransport({ model: "mistralai/mistral-small-2603", upstreamProvider: "mistral", apiKey: "test", fetchImpl }).call(inp);
    const p = body.provider as Record<string, unknown>;
    assert.deepEqual(p.only, ["mistral"]);
    assert.equal(p.allow_fallbacks, false);
    assert.equal(p.require_parameters, true);
    assert.equal(p.data_collection, "deny", "data_collection nested inside provider");
    assert.equal("data_collection" in body, false, "top-level data_collection must not exist");
    assert.equal("zdr" in body, false, "top-level zdr must not exist");
    assert.equal("models" in body, false, "no model fallback array");
  });

  it("zdr opt-in nests inside provider, never top-level", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: unknown, init: unknown) => {
      body = JSON.parse((init as { body: string }).body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "mistralai/mistral-small-2603", provider: "Mistral" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await createOpenRouterTransport({ model: "mistralai/mistral-small-2603", upstreamProvider: "mistral", apiKey: "test", fetchImpl, zdr: true }).call(inp);
    const p = body.provider as Record<string, unknown>;
    assert.equal(p.zdr, true, "zdr nested inside provider");
    assert.equal("zdr" in body, false, "top-level zdr must not exist");
  });
});

describe("Core v2.3R.4 — fairness + validation", () => {
  it("canonical validation is identical across providers (single validator)", () => {
    assert.equal(canonicalContractValid(JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "subject", value: "x" }] })), true);
    assert.equal(canonicalContractValid(JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "bogus" }] })), false);
    assert.equal(canonicalContractValid("not json"), false);
    assert.equal(canonicalContractValid(undefined), false);
    assert.equal(canonicalContractValid(""), false);
  });

  it("Gemini Arena uses maxAttempts=1 while non-Arena default stays 2", async () => {
    assert.equal(CORE_V2_MAX_REASONING_ATTEMPTS, 2, "production default unchanged");
    let calls = 0;
    const fetchImpl = (async () => { calls++; throw Object.assign(new Error("aborted"), { name: "AbortError" }); }) as typeof fetch;
    const res = await createGeminiTransport({ fetchImpl, apiKey: "test" }).call(inp);
    assert.equal(calls, 1, "failed first attempt is NOT retried in Arena");
    assert.equal(res.error?.code, "timeout");
  });

  it("OpenRouter captures charged cost metadata if present", async () => {
    const fetchImpl = jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "subject", value: "x" }] }) } }], model: "deepseek/deepseek-flash", provider: "deepseek", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.00123 } });
    const res = await createOpenRouterTransport({ model: "deepseek/deepseek-flash", upstreamProvider: "deepseek", apiKey: "test", fetchImpl }).call(inp);
    assert.equal(res.usage.cost, 0.00123);
  });

  it("absent cost marks economics COST_INCOMPLETE", () => {
    const s = summarizeArena([mkRecord({ outcome: "PASS", cost: { requests: [req("reasoning", null, "billed")] } })]);
    assert.equal(s.costIncomplete, true);
    assert.equal(s.costPerSuccessfulTask, null);
  });
});
