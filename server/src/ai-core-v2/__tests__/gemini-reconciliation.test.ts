/**
 * VAUTO AI Core v2.3R.3 — Gemini baseline reconciliation (mocked HTTP only).
 * Proves the Arena Gemini transport and the baseline R3 provider share ONE
 * authoritative request/parser/retry implementation (no drift). No network.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createGeminiSemanticClaimProvider,
  R3_SYSTEM_INSTRUCTION,
  SEMANTIC_CLAIM_SCHEMA,
} from "../provider/semantic-claim.js";
import { createGeminiTransport } from "../arena/transports.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";
import type { ReasoningInput } from "../reasoning/reasoning-contract.js";

const inp: ReasoningInput = {
  userTurn: "Ieškau Toyota Corolla.",
  history: [],
  state: emptyMarketplaceState(),
  capabilities: [{ name: "searchListings", description: "x", operation: "READ" }],
};

function jsonResp(body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}

describe("Core v2.3R.3 — Gemini baseline reconciliation", () => {
  it("1: baseline provider and Arena transport emit identical Gemini request", async () => {
    const bodies: unknown[] = [];
    const capture = (init: unknown) => bodies.push(JSON.parse((init as { body: string }).body));
    const baselineFetch = (async (_u: unknown, i: unknown) => { capture(i); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ actionKind: "direct", text: "ok" }) }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;
    const arenaFetch = (async (_u: unknown, i: unknown) => { capture(i); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ actionKind: "direct", text: "ok" }) }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;

    process.env.GEMINI_API_KEY = "test";
    await createGeminiSemanticClaimProvider({ fetchImpl: baselineFetch, maxAttempts: 1 })(inp);
    delete process.env.GEMINI_API_KEY;
    await createGeminiTransport({ fetchImpl: arenaFetch, apiKey: "test" }).call(inp);

    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0], bodies[1], "request body identical");
  });

  it("2: same system instruction", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: unknown, i: unknown) => {
      body = JSON.parse((i as { body: string }).body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ actionKind: "direct", text: "ok" }) }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await createGeminiTransport({ fetchImpl, apiKey: "test" }).call(inp);
    const si = (body.systemInstruction as { parts: Array<{ text: string }> }).parts[0].text;
    assert.equal(si, R3_SYSTEM_INSTRUCTION);
  });

  it("3: same semantic schema", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: unknown, i: unknown) => {
      body = JSON.parse((i as { body: string }).body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ actionKind: "direct", text: "ok" }) }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await createGeminiTransport({ fetchImpl, apiKey: "test" }).call(inp);
    const gc = body.generationConfig as { responseSchema: unknown };
    assert.deepEqual(gc.responseSchema, SEMANTIC_CLAIM_SCHEMA);
  });

  it("4: identical mocked response → identical decision (same parser)", async () => {
    const response = { candidates: [{ content: { parts: [{ text: JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "subject", value: "Toyota Corolla" }] }) }] } }], usageMetadata: { totalTokenCount: 10 } };
    process.env.GEMINI_API_KEY = "test";
    const baselineDecision = await createGeminiSemanticClaimProvider({ fetchImpl: jsonResp(response), maxAttempts: 1 })(inp);
    delete process.env.GEMINI_API_KEY;
    const arenaResult = await createGeminiTransport({ fetchImpl: jsonResp(response), apiKey: "test" }).call(inp);
    assert.deepEqual(arenaResult.decision, baselineDecision);
  });

  it("5: usage instrumentation does not alter decision", async () => {
    const response = { candidates: [{ content: { parts: [{ text: JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "constraint", concept: "price", boundary: "max", value: 15000, strength: "hard" }] }) }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } };
    process.env.GEMINI_API_KEY = "test";
    const baselineDecision = await createGeminiSemanticClaimProvider({ fetchImpl: jsonResp(response), maxAttempts: 1 })(inp);
    delete process.env.GEMINI_API_KEY;
    const arenaResult = await createGeminiTransport({ fetchImpl: jsonResp(response), apiKey: "test" }).call(inp);
    assert.deepEqual(arenaResult.decision, baselineDecision, "instrumentation is observational");
    assert.equal(arenaResult.usage.inputTokens, 1);
    assert.equal(arenaResult.usage.outputTokens, 2);
  });

  it("7: timeout error preserved (baseline throws timeout, arena normalizes to timeout)", async () => {
    const hanging = (async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }) as typeof fetch;
    process.env.GEMINI_API_KEY = "test";
    await assert.rejects(() => createGeminiSemanticClaimProvider({ fetchImpl: hanging, maxAttempts: 1 })(inp), (e) => (e as { code?: string }).code === "timeout");
    delete process.env.GEMINI_API_KEY;
    const arenaResult = await createGeminiTransport({ fetchImpl: hanging, apiKey: "test" }).call(inp);
    assert.equal(arenaResult.error?.code, "timeout");
  });
});
