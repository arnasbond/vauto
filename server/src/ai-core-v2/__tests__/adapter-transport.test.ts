/**
 * VAUTO AI Core v2.3R.2 — provider transport adapter tests (MOCKED HTTP only).
 * No network. Proves each adapter parses the same R3 contract, extracts usage,
 * and classifies malformed/schema-invalid output as CONTRACT_FAIL.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGeminiTransport, createDeepSeekTransport, createMistralTransport, createOpenAITransport } from "../arena/transports.js";
import { normalizeUsage } from "../arena/normalize.js";
import { computeCost, DEEPSEEK_FLASH_PEAK, DEEPSEEK_FLASH_OFFPEAK, OPENAI_LUNA_PRICE } from "../arena/price.js";
import { NO_USAGE } from "../arena/types.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";
import type { ReasoningInput } from "../reasoning/reasoning-contract.js";

const inp: ReasoningInput = { userTurn: "ieškau", history: [], state: emptyMarketplaceState(), capabilities: [] };

function jsonResponse(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}

describe("Core v2.3R.2 — transport adapters (mocked HTTP)", () => {
  it("Gemini adapter parses decision + normalizes usage", async () => {
    const fetchImpl = jsonResponse({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "subject", value: "Toyota Corolla" }] }) }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
    });
    const res = await createGeminiTransport({ fetchImpl, apiKey: "test" }).call(inp);
    assert.equal(res.decision?.claims?.[0]?.role, "subject");
    assert.equal(res.usage.inputTokens, 100);
    assert.equal(res.usage.outputTokens, 50);
    assert.equal(res.usage.totalTokens, 150);
  });

  it("DeepSeek parses valid JSON object", async () => {
    const fetchImpl = jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "exclusion", label: "diesel" }] }) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    const res = await createDeepSeekTransport({ fetchImpl, apiKey: "test" }).call(inp);
    assert.equal(res.decision?.claims?.[0]?.role, "exclusion");
    assert.equal(res.usage.inputTokens, 10);
  });

  it("DeepSeek malformed JSON => malformed_json (CONTRACT_FAIL)", async () => {
    const fetchImpl = jsonResponse({ choices: [{ message: { content: "not json" } }] });
    const res = await createDeepSeekTransport({ fetchImpl, apiKey: "test" }).call(inp);
    assert.equal(res.decision, null);
    assert.equal(res.error?.code, "malformed_json");
  });

  it("DeepSeek schema-invalid JSON => schema_invalid (CONTRACT_FAIL)", async () => {
    const fetchImpl = jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "bogus" }] }) } }] });
    const res = await createDeepSeekTransport({ fetchImpl, apiKey: "test" }).call(inp);
    assert.equal(res.decision, null);
    assert.equal(res.error?.code, "schema_invalid");
  });

  it("Mistral parses structured response", async () => {
    const fetchImpl = jsonResponse({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "constraint", concept: "price", boundary: "max", value: 15000, strength: "hard" }] }) } }] });
    const res = await createMistralTransport({ fetchImpl, apiKey: "test" }).call(inp);
    assert.equal(res.decision?.claims?.[0]?.concept, "price");
    assert.equal(res.decision?.claims?.[0]?.boundary, "max");
  });

  it("OpenAI parses structured response with cached + reasoning tokens", async () => {
    const fetchImpl = jsonResponse({
      choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok", claims: [{ role: "subject", value: "x" }] }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, prompt_tokens_details: { cached_tokens: 20 }, completion_tokens_details: { reasoning_tokens: 30 } },
    });
    const res = await createOpenAITransport({ fetchImpl, apiKey: "test" }).call(inp);
    assert.equal(res.usage.inputTokens, 100);
    assert.equal(res.usage.cachedInputTokens, 20);
    assert.equal(res.usage.reasoningTokens, 30);
  });

  it("OpenAI adapter sends fixed reasoning effort", async () => {
    let captured: Record<string, unknown> = {};
    const fetchImpl = (async (_url: unknown, init: unknown) => {
      captured = JSON.parse((init as { body: string }).body);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ actionKind: "direct", text: "ok" }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await createOpenAITransport({ fetchImpl, apiKey: "test", reasoningEffort: "low" }).call(inp);
    assert.equal((captured.reasoning as { effort: string }).effort, "low");
  });

  it("usage normalization handles all four providers (cached + reasoning)", () => {
    assert.equal(normalizeUsage({ prompt_cache_hit_tokens: 7 }).cachedInputTokens, 7);
    assert.equal(normalizeUsage({ prompt_tokens_details: { cached_tokens: 8 } }).cachedInputTokens, 8);
    assert.equal(normalizeUsage({ completion_tokens_details: { reasoning_tokens: 9 } }).reasoningTokens, 9);
    assert.equal(normalizeUsage({ totalTokenCount: 123 }).totalTokens, 123);
  });

  it("OpenAI >272K prompt tokens marks cost invalid (null)", () => {
    const over = { ...NO_USAGE, inputTokens: 300_000, outputTokens: 1000 };
    assert.equal(computeCost(over, OPENAI_LUNA_PRICE), null, "must not assume short-context price above 272K");
    const under = { ...NO_USAGE, inputTokens: 1000, outputTokens: 500 };
    assert.equal(computeCost(under, OPENAI_LUNA_PRICE), 1000 * OPENAI_LUNA_PRICE.inputPrice! + 500 * OPENAI_LUNA_PRICE.outputPrice!);
  });

  it("DeepSeek peak/off-peak are distinct immutable snapshots (no auto-selection)", () => {
    assert.ok(DEEPSEEK_FLASH_PEAK.inputPrice! > DEEPSEEK_FLASH_OFFPEAK.inputPrice!);
    assert.notEqual(DEEPSEEK_FLASH_PEAK.inputPrice, DEEPSEEK_FLASH_OFFPEAK.inputPrice);
    assert.throws(() => { (DEEPSEEK_FLASH_PEAK as { inputPrice: number }).inputPrice = 0; }, TypeError);
    assert.throws(() => { (DEEPSEEK_FLASH_OFFPEAK as { inputPrice: number }).inputPrice = 0; }, TypeError);
  });
});
