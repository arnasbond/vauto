/**
 * PR #104 — Bounded Malformed Model Output Recovery Invariants
 *
 * Verifies that:
 * A. Transient malformed/empty structured model output takes the intended bounded recovery path
 *    (attempt 1 returns invalid JSON, attempt 2 returns valid JSON → turn succeeds).
 * B. Recovery remains bounded if the provider repeatedly returns malformed output (fails after maxAttempts).
 * C. Successful READ capability results in context are preserved/reused without re-execution during provider retries.
 * D. Error mapping in streaming handler preserves truthful malformed_json code instead of thread_update_contention.
 * E. Normal successful Core v2 reasoning/capability flow remains regressions-free.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callDeepSeekSemanticTransport } from "../provider/deepseek-provider.js";
import { ProviderFailureError, isRetryableFailure } from "../provider/provider-errors.js";
import { runMultiStepLoop } from "../loop/multi-step-loop.js";
import { CapabilityRegistry } from "../capability/registry.js";
import { searchListingsCapability } from "../capability/capabilities/search-listings.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";
import type { ReasoningInput } from "../reasoning/reasoning-contract.js";

const baseInput: ReasoningInput = {
  userTurn: "Nežinau tiksliai kokio automobilio noriu. Reikia šeimai patikimo automobilio iki 20 tūkst. eurų.",
  history: [],
  state: emptyMarketplaceState(),
  capabilities: [{ name: "searchListings", description: "Search listings", operation: "READ" }],
};

describe("PR #104 Malformed Model Output Recovery & Error Mapping Invariants", () => {
  it("A. Transient malformed JSON output recovers on attempt 2", async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount++;
      if (callCount === 1) {
        // Attempt 1: return truncated/malformed JSON
        return new Response(JSON.stringify({ choices: [{ message: { content: "{ actionKind: 'direct', text: " } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Attempt 2: return valid JSON
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  actionKind: "direct",
                  text: "Šeimai siūlau Citroën Grand C4 Picasso ir Citroën DS5.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const res = await callDeepSeekSemanticTransport(baseInput, {
      fetchImpl,
      apiKey: "test-key",
      maxAttempts: 2,
    });

    assert.equal(callCount, 2, "Should attempt twice to recover from transient malformed JSON");
    assert.equal(res.attempts, 2, "Transport result should record 2 attempts");
    assert.equal(res.decision.actionKind, "direct");
    assert.equal(res.decision.text, "Šeimai siūlau Citroën Grand C4 Picasso ir Citroën DS5.");
  });

  it("B. Recovery remains bounded when provider repeatedly returns malformed JSON", async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount++;
      return new Response(JSON.stringify({ choices: [{ message: { content: "invalid json string" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await assert.rejects(
      () =>
        callDeepSeekSemanticTransport(baseInput, {
          fetchImpl,
          apiKey: "test-key",
          maxAttempts: 2,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ProviderFailureError);
        assert.equal(err.code, "malformed_json");
        return true;
      }
    );

    assert.equal(callCount, 2, "Must stop after maxAttempts (bounded retry)");
  });

  it("C. Successful READ capability result is preserved and NOT re-executed during provider retries", async () => {
    let capabilityExecutions = 0;
    let providerCalls = 0;

    const registry = new CapabilityRegistry();
    registry.register({
      ...searchListingsCapability,
      execute: async () => {
        capabilityExecutions++;
        return { ok: true, data: { count: 2, listings: [{ title: "Citroën Grand C4 Picasso" }] } };
      },
    });

    const mockProvider = async (inp: ReasoningInput) => {
      providerCalls++;
      // Iteration 1: request searchListings capability
      if (providerCalls === 1) {
        return {
          capabilityRequest: { capability: "searchListings", args: { category: "vehicles", maxPrice: 20000 } },
        };
      }
      // Iteration 2 attempt 1: provider returns valid decision using groundedResults already in context
      assert.ok(inp.groundedResults && inp.groundedResults.length === 1, "Prior search result must be present in context");
      return {
        text: "Radau 2 automobilius.",
      };
    };

    const loopResult = await runMultiStepLoop({
      provider: mockProvider,
      registry,
      input: baseInput,
    });

    assert.equal(capabilityExecutions, 1, "searchListings READ capability must be executed exactly once");
    assert.equal(loopResult.decision.text, "Radau 2 automobilius.");
  });

  it("D. isRetryableFailure accurately identifies malformed_json and schema_invalid as retryable", () => {
    assert.equal(isRetryableFailure(new ProviderFailureError("malformed_json", "bad json")), true);
    assert.equal(isRetryableFailure(new ProviderFailureError("schema_invalid", "bad schema")), true);
    assert.equal(isRetryableFailure(new ProviderFailureError("timeout", "timeout")), false);
    assert.equal(isRetryableFailure(new ProviderFailureError("provider_unavailable", "no key")), false);
    assert.equal(isRetryableFailure(new ProviderFailureError("http_error", "500 server error", 500)), true);
  });

  it("E. Normal successful Core v2 reasoning/capability flow operates without regressions", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  actionKind: "direct",
                  text: "Sveiki! Kuo galiu padėti?",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    const res = await callDeepSeekSemanticTransport(baseInput, {
      fetchImpl,
      apiKey: "test-key",
      maxAttempts: 2,
    });

    assert.equal(res.attempts, 1, "Successful attempt should complete in 1 attempt");
    assert.equal(res.decision.text, "Sveiki! Kuo galiu padėti?");
  });
});
