/**
 * VAUTO AI Core v2 — DeepSeek reasoning provider unit tests (MOCKED HTTP only).
 * Proves provider selection, DeepSeek transport payload formatting, error handling,
 * and fail-closed parsing through the canonical parseSemanticDecision boundary.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  getCoreV2Provider,
  DEEPSEEK_V4_1_FLASH_MODEL,
} from "../provider/model-config.js";
import {
  createDeepSeekReasoningProvider,
  callDeepSeekSemanticTransport,
} from "../provider/deepseek-provider.js";
import { ProviderFailureError } from "../provider/provider-errors.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";
import type { ReasoningInput } from "../reasoning/reasoning-contract.js";

const input: ReasoningInput = {
  userTurn: "Ieškau automobilio iki 15000 eurų.",
  history: [],
  state: emptyMarketplaceState(),
  capabilities: [{ name: "searchListings", description: "Search listings", operation: "READ" }],
};

function mockedFetch(responseBody: unknown, status = 200): typeof fetch {
  return (async (_url: unknown, _init: unknown) =>
    new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

describe("Core v2 — DeepSeek Reasoning Provider (Mocked HTTP)", () => {
  const originalEnv = process.env.VAUTO_AI_PROVIDER;

  beforeEach(() => {
    delete process.env.VAUTO_AI_PROVIDER;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.VAUTO_AI_PROVIDER = originalEnv;
    } else {
      delete process.env.VAUTO_AI_PROVIDER;
    }
  });

  it("1: provider selection defaults to Gemini when VAUTO_AI_PROVIDER is unset", () => {
    assert.equal(getCoreV2Provider(), "gemini");
  });

  it("2: explicit VAUTO_AI_PROVIDER=deepseek selects DeepSeek reasoning provider", () => {
    process.env.VAUTO_AI_PROVIDER = "deepseek";
    assert.equal(getCoreV2Provider(), "deepseek");
  });

  it("3: request uses model: deepseek-flash, correct endpoint, headers, and json_object response_format", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  actionKind: "capability",
                  capabilityRequest: { capability: "searchListings", args: {} },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    await callDeepSeekSemanticTransport(input, {
      fetchImpl,
      apiKey: "test-deepseek-key",
      maxAttempts: 1,
    });

    assert.equal(capturedUrl, "https://api.deepseek.com/chat/completions");
    assert.ok(capturedInit);
    const headers = capturedInit.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer test-deepseek-key");
    assert.equal(headers["Content-Type"], "application/json");

    const body = JSON.parse(capturedInit.body as string) as Record<string, unknown>;
    assert.equal(body.model, DEEPSEEK_V4_1_FLASH_MODEL);
    assert.equal(body.model, "deepseek-flash");
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.temperature, 0.2);
  });

  it("4: valid DeepSeek JSON → canonical SemanticDecision and ReasoningDecision", async () => {
    const fetchImpl = mockedFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              actionKind: "direct",
              text: "Rasti variantai pagal jūsų paiešką.",
              claims: [{ role: "constraint", concept: "price", boundary: "max", value: 15000, strength: "hard" }],
            }),
          },
        },
      ],
    });

    const provider = createDeepSeekReasoningProvider({
      fetchImpl,
      apiKey: "test-key",
      maxAttempts: 1,
    });

    const decision = await provider(input);
    assert.equal(decision.text, "Rasti variantai pagal jūsų paiešką.");
    assert.ok(decision.statePatches && decision.statePatches.length === 1);
    assert.equal((decision.statePatches[0] as { op: string; key?: string }).key, "priceMax");
  });

  it("5: malformed JSON fails closed with malformed_json error", async () => {
    const fetchImpl = mockedFetch({
      choices: [{ message: { content: "this is not valid json" } }],
    });

    const provider = createDeepSeekReasoningProvider({
      fetchImpl,
      apiKey: "test-key",
      maxAttempts: 1,
    });

    await assert.rejects(
      () => provider(input),
      (err: unknown) => err instanceof ProviderFailureError && err.code === "malformed_json"
    );
  });

  it("6: empty DeepSeek content fails closed with empty_response error", async () => {
    const fetchImpl = mockedFetch({
      choices: [{ message: { content: "   " } }],
    });

    const provider = createDeepSeekReasoningProvider({
      fetchImpl,
      apiKey: "test-key",
      maxAttempts: 1,
    });

    await assert.rejects(
      () => provider(input),
      (err: unknown) => err instanceof ProviderFailureError && err.code === "empty_response"
    );
  });

  it("7: missing or invalid actionKind fails closed through existing canonical parser with schema_invalid", async () => {
    const fetchImplMissingAction = mockedFetch({
      choices: [{ message: { content: JSON.stringify({ text: "No actionKind provided" }) } }],
    });

    const providerMissing = createDeepSeekReasoningProvider({
      fetchImpl: fetchImplMissingAction,
      apiKey: "test-key",
      maxAttempts: 1,
    });

    await assert.rejects(
      () => providerMissing(input),
      (err: unknown) => err instanceof ProviderFailureError && err.code === "schema_invalid"
    );

    const fetchImplInvalidAction = mockedFetch({
      choices: [{ message: { content: JSON.stringify({ actionKind: "invalid_action_kind", text: "Invalid" }) } }],
    });

    const providerInvalid = createDeepSeekReasoningProvider({
      fetchImpl: fetchImplInvalidAction,
      apiKey: "test-key",
      maxAttempts: 1,
    });

    await assert.rejects(
      () => providerInvalid(input),
      (err: unknown) => err instanceof ProviderFailureError && err.code === "schema_invalid"
    );
  });

  it("8: deepseek provider failure throws directly without silent fallback", async () => {
    const fetchImpl = mockedFetch({ error: "Rate limit exceeded" }, 429);

    const provider = createDeepSeekReasoningProvider({
      fetchImpl,
      apiKey: "test-key",
      maxAttempts: 1,
    });

    await assert.rejects(
      () => provider(input),
      (err: unknown) => err instanceof ProviderFailureError && err.code === "http_error" && err.status === 429
    );
  });
});
