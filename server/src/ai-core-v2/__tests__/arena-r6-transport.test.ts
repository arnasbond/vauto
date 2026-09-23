/**
 * VAUTO AI Core v2.3R.6 — Arena-only OpenRouter routing modes (mocked HTTP).
 * No network. Proves PINNED (R.5) is unchanged and ELIGIBLE_ENDPOINTS (R.6)
 * emits the exact provider config required by the Arena, with identity
 * validation and a shared canonical validator.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOpenRouterTransport, createGeminiTransport, canonicalContractValid } from "../arena/transports.js";
import { CORE_V2_MAX_REASONING_ATTEMPTS } from "../provider/model-config.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";
import type { ReasoningInput } from "../reasoning/reasoning-contract.js";

const inp: ReasoningInput = { userTurn: "ieškau", history: [], state: emptyMarketplaceState(), capabilities: [] };

function jsonResponse(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}

function captureBody(bodyRef: { value: Record<string, unknown> }, respond: unknown = { choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "deepseek/deepseek-v4.1-flash" }): typeof fetch {
  return (async (_u: unknown, init: unknown) => {
    bodyRef.value = JSON.parse((init as { body: string }).body);
    return new Response(JSON.stringify(respond), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

describe("Core v2.3R.6 — PINNED mode (R.5 behavior unchanged)", () => {
  it("default routing is pinned: provider.only + allow_fallbacks=false", async () => {
    const body = { value: {} as Record<string, unknown> };
    await createOpenRouterTransport({ model: "deepseek/deepseek-v4.1-flash", upstreamProvider: "deepseek", apiKey: "test", fetchImpl: captureBody(body, { choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "deepseek/deepseek-v4.1-flash", provider: "deepseek" }) }).call(inp);
    const p = body.value.provider as Record<string, unknown>;
    assert.deepEqual(p.only, ["deepseek"], "provider.only preserved");
    assert.equal(p.allow_fallbacks, false);
    assert.equal(p.require_parameters, true);
  });

  it("explicit routing:'pinned' is identical to R.5 (no regression)", async () => {
    const body = { value: {} as Record<string, unknown> };
    await createOpenRouterTransport({ model: "deepseek/deepseek-v4.1-flash", upstreamProvider: "deepseek", routing: "pinned", apiKey: "test", fetchImpl: captureBody(body, { choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "deepseek/deepseek-v4.1-flash", provider: "deepseek" }) }).call(inp);
    const p = body.value.provider as Record<string, unknown>;
    assert.deepEqual(p.only, ["deepseek"]);
    assert.equal(p.allow_fallbacks, false);
    assert.equal(p.require_parameters, true);
    assert.equal(p.data_collection, "deny");
    assert.equal("models" in body.value, false);
    assert.equal("data_collection" in body.value, false);
    assert.equal("zdr" in body.value, false);
  });
});

describe("Core v2.3R.6 — ELIGIBLE_ENDPOINTS mode", () => {
  it("emits no provider.only, allow_fallbacks=true, require_parameters=true", async () => {
    const body = { value: {} as Record<string, unknown> };
    await createOpenRouterTransport({ model: "deepseek/deepseek-v4.1-flash", routing: "eligible_endpoints", apiKey: "test", fetchImpl: captureBody(body, { choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "deepseek/deepseek-v4.1-flash", provider: "deepseek" }) }).call(inp);
    const p = body.value.provider as Record<string, unknown>;
    assert.equal("only" in p, false, "provider.only must be absent");
    assert.equal(p.allow_fallbacks, true);
    assert.equal(p.require_parameters, true);
    assert.equal(p.data_collection, "deny", "provider.data_collection=deny");
    assert.equal("data_collection" in body.value, false, "top-level data_collection absent");
    assert.equal("models" in body.value, false, "no models fallback array");
    assert.equal("zdr" in body.value, false, "ZDR off");
    assert.equal("zdr" in p, false, "no zdr nested in provider");
  });

  it("records eligible_endpoints routing + fallbackAllowed in identity", async () => {
    const body = { value: {} as Record<string, unknown> };
    const res = await createOpenRouterTransport({ model: "openai/gpt-5.6-luna", routing: "eligible_endpoints", apiKey: "test", fetchImpl: captureBody(body, { choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "openai/gpt-5.6-luna", provider: "OpenAI" }) }).call(inp);
    assert.equal(res.transportIdentity?.routing, "eligible_endpoints");
    assert.equal(res.transportIdentity?.fallbackAllowed, true);
    assert.equal(res.transportIdentity?.requestedUpstreamProvider, undefined);
  });

  it("returned model mismatch => transport_invalid", async () => {
    const res = await createOpenRouterTransport({ model: "openai/gpt-5.6-luna", routing: "eligible_endpoints", apiKey: "test", fetchImpl: jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "deepseek/deepseek-v4.1-flash", provider: "DeepSeek" }) }).call(inp);
    assert.equal(res.error?.code, "transport_invalid");
    assert.equal(res.transportIdentity?.requestedModel, "openai/gpt-5.6-luna");
    assert.equal(res.transportIdentity?.returnedModel, "deepseek/deepseek-v4.1-flash");
  });

  it("different upstream provider for SAME requested model is allowed (no provider-only lock)", async () => {
    const res = await createOpenRouterTransport({ model: "deepseek/deepseek-v4.1-flash", routing: "eligible_endpoints", apiKey: "test", fetchImpl: jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "subject", value: "x" }] }) } }], model: "deepseek/deepseek-v4.1-flash", provider: "chutes" }) }).call(inp);
    assert.equal(res.error, undefined, "provider identity is NOT checked in eligible_endpoints");
    assert.equal(res.transportIdentity?.actualUpstreamProvider, "chutes");
    assert.equal(res.decision?.claims?.[0]?.role, "subject");
  });

  it("captures HTTP status on success and failure", async () => {
    const ok = await createOpenRouterTransport({ model: "deepseek/deepseek-v4.1-flash", routing: "eligible_endpoints", apiKey: "test", fetchImpl: jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }], model: "deepseek/deepseek-v4.1-flash" }) }).call(inp);
    assert.equal(ok.transportIdentity?.httpStatus, 200);
    const err = await createOpenRouterTransport({ model: "deepseek/deepseek-v4.1-flash", routing: "eligible_endpoints", apiKey: "test", fetchImpl: jsonResponse({ error: { message: "bad" } }, 402) }).call(inp);
    assert.equal(err.transportIdentity?.httpStatus, 402);
    assert.equal(err.error?.code, "http_error");
    assert.equal(err.error?.status, 402);
  });
});

describe("Core v2.3R.6 — Arena fairness + canonical validator", () => {
  it("Arena maxAttempts=1 while production default stays 2", async () => {
    assert.equal(CORE_V2_MAX_REASONING_ATTEMPTS, 2, "production default unchanged");
    let calls = 0;
    const fetchImpl = (async () => { calls++; throw Object.assign(new Error("aborted"), { name: "AbortError" }); }) as typeof fetch;
    const res = await createGeminiTransport({ fetchImpl, apiKey: "test" }).call(inp);
    assert.equal(calls, 1, "failed first attempt is NOT retried in Arena");
    assert.equal(res.error?.code, "timeout");
  });

  it("canonical validator unchanged (single shared validator)", () => {
    assert.equal(canonicalContractValid(JSON.stringify({ claims: [{ role: "subject", value: "x" }] })), true);
    assert.equal(canonicalContractValid(JSON.stringify({ claims: [{ role: "bogus" }] })), false);
    assert.equal(canonicalContractValid("not json"), false);
    assert.equal(canonicalContractValid(undefined), false);
    assert.equal(canonicalContractValid(""), false);
  });
});
