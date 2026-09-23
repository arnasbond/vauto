/**
 * VAUTO AI Core v2.3B — provider robustness + timeout-budget composition.
 *
 * Proves (deterministically, with mocked fetch) how the bounded timeout and
 * retry compose into wall-clock latency, and that the authority verifier
 * fails closed on timeout. No network, no credential, no secret.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGeminiReasoningProvider, ProviderFailureError } from "../provider/gemini-provider.js";
import {
  CORE_V2_MAX_REASONING_ATTEMPTS,
  CORE_V2_REASONING_TIMEOUT_MS,
  CORE_V2_TURN_BUDGET_MS,
  CORE_V2_VERIFIER_TIMEOUT_MS,
} from "../provider/model-config.js";
import { createGeminiAuthorityVerifier } from "../loop/authority-verifier.js";
import { emptyMarketplaceState } from "../state/marketplace-state.js";
import type { ReasoningInput } from "../reasoning/reasoning-contract.js";

const inp: ReasoningInput = {
  userTurn: "labas",
  history: [],
  state: emptyMarketplaceState(),
  capabilities: [],
};

/** A fetch that never resolves; it rejects with AbortError when the caller's
 *  AbortSignal fires (simulating a real provider timeout). */
function hangingFetch(): typeof fetch {
  return (async (_url, init) => {
    const signal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      const onAbort = () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }) as typeof fetch;
}

function jsonFetch(status: number, body: unknown = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
}

describe("Core v2.3B — timeout/retry budget composition", () => {
  it("a timed-out reasoning call is retried exactly maxAttempts times (latency multiplies)", async () => {
    let calls = 0;
    const fetchImpl = (async (u: unknown, i: unknown) => {
      calls++;
      return await hangingFetch()(u as never, i as never);
    }) as typeof fetch;

    const provider = createGeminiReasoningProvider({ fetchImpl, timeoutMs: 25, maxAttempts: 2 });
    await assert.rejects(
      () => provider(inp),
      (e: unknown) => e instanceof ProviderFailureError && e.code === "timeout"
    );
    assert.equal(calls, 2, "two 25ms aborts = ~50ms wall clock (bounded retry multiplies)");
  });

  it("a non-retryable 4xx is NOT retried (fails fast)", async () => {
    let calls = 0;
    const fetchImpl = (async (u: unknown, i: unknown) => {
      calls++;
      return await jsonFetch(400)(u as never, i as never);
    }) as typeof fetch;

    const provider = createGeminiReasoningProvider({ fetchImpl, timeoutMs: 25, maxAttempts: 2 });
    await assert.rejects(
      () => provider(inp),
      (e: unknown) => e instanceof ProviderFailureError && e.code === "http_error" && e.status === 400
    );
    assert.equal(calls, 1, "4xx is not retried");
  });

  it("a retryable 5xx is retried exactly maxAttempts times then surfaced", async () => {
    let calls = 0;
    const fetchImpl = (async (u: unknown, i: unknown) => {
      calls++;
      return await jsonFetch(500)(u as never, i as never);
    }) as typeof fetch;

    const provider = createGeminiReasoningProvider({ fetchImpl, timeoutMs: 25, maxAttempts: 2 });
    await assert.rejects(
      () => provider(inp),
      (e: unknown) => e instanceof ProviderFailureError && e.code === "http_error" && e.status === 500
    );
    assert.equal(calls, 2, "5xx retried once (bounded)");
  });

  it("a network fetch failure (no HTTP status) IS retried as transient", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      throw new Error("ECONNRESET");
    }) as typeof fetch;

    const provider = createGeminiReasoningProvider({ fetchImpl, timeoutMs: 25, maxAttempts: 2 });
    await assert.rejects(
      () => provider(inp),
      (e: unknown) => e instanceof ProviderFailureError && e.code === "http_error" && e.status === undefined
    );
    assert.equal(calls, 2, "network failure retried once (bounded)");
  });

  it("the configured budget is bounded and finite", () => {
    assert.equal(CORE_V2_MAX_REASONING_ATTEMPTS, 2);
    assert.equal(CORE_V2_REASONING_TIMEOUT_MS, 30_000);
    // Per reasoning call worst case = maxAttempts * timeoutMs = 60s.
    assert.equal(CORE_V2_MAX_REASONING_ATTEMPTS * CORE_V2_REASONING_TIMEOUT_MS, 60_000);
    // Verifier ceiling is shorter than the reasoning ceiling (fast fail-closed tail).
    assert.equal(CORE_V2_VERIFIER_TIMEOUT_MS, 15_000);
    // Total turn budget is a hard ceiling, at least one full worst-case reasoning call.
    assert.equal(CORE_V2_TURN_BUDGET_MS, 90_000);
    assert.ok(CORE_V2_TURN_BUDGET_MS >= CORE_V2_MAX_REASONING_ATTEMPTS * CORE_V2_REASONING_TIMEOUT_MS + CORE_V2_VERIFIER_TIMEOUT_MS);
  });

  it("authority verifier fails CLOSED on timeout (never grants authority)", async () => {
    const verifier = createGeminiAuthorityVerifier({ fetchImpl: hangingFetch(), timeoutMs: 25 });
    const verdict = await verifier(
      { op: "setHard", key: "priceMax", value: 20000, evidence: "iki 20 tūkst." },
      { userTurn: "iki 20 tūkst.", priorState: emptyMarketplaceState() }
    );
    assert.equal(verdict, "UNSUPPORTED");
  });
});

describe("Core v2.3B — sanitized per-attempt observability", () => {
  /** Run with a sentinel credential; asserts the telemetry never carries it. */
  async function withSentinelKey<T>(fn: () => Promise<T>): Promise<T> {
    const sentinel = `SENTINEL_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = sentinel;
    try {
      return await fn();
    } finally {
      if (prev === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prev;
    }
  }

  it("emits sanitized telemetry (no credential, no raw body) on a successful parse", async () => {
    await withSentinelKey(async () => {
      const attempts: Array<Record<string, unknown>> = [];
      const fetchImpl = (async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ actionKind: "capability", capabilityRequest: { capability: "searchListings", args: {} } }) }],
                },
                finishReason: "STOP",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )) as typeof fetch;

      const provider = createGeminiReasoningProvider({
        fetchImpl,
        onAttempt: (t) => attempts.push(t as unknown as Record<string, unknown>),
      });
      await provider(inp);

      assert.equal(attempts.length, 1, "one attempt, one telemetry emission");
      const serialized = JSON.stringify(attempts);
      assert.ok(!serialized.includes("SENTINEL_"), "telemetry must not leak the API credential");
      assert.ok(!serialized.includes("x-goog-api-key"), "telemetry must not leak header names");
      assert.ok(!serialized.includes("systemInstruction"), "telemetry must not leak the raw request body");

      const t = attempts[0]!;
      assert.equal(t.parseOutcome, "ok");
      assert.equal(t.finishReason, "STOP");
      assert.equal(t.candidateCount, 1);
      assert.equal(t.capabilityRequested, "searchListings");
      assert.equal(t.timedOut, false);
      assert.equal(typeof t.elapsedMs, "number");
    });
  });

  it("emits timedOut=true telemetry once per retried attempt", async () => {
    await withSentinelKey(async () => {
      const attempts: Array<Record<string, unknown>> = [];
      const provider = createGeminiReasoningProvider({
        fetchImpl: hangingFetch(),
        timeoutMs: 25,
        maxAttempts: 2,
        onAttempt: (t) => attempts.push(t as unknown as Record<string, unknown>),
      });

      await assert.rejects(
        () => provider(inp),
        (e: unknown) => e instanceof ProviderFailureError && e.code === "timeout"
      );

      assert.equal(attempts.length, 2, "telemetry emitted per attempt (bounded)");
      assert.deepEqual(
        attempts.map((t) => t.attempt),
        [1, 2]
      );
      assert.ok(attempts.every((t) => t.timedOut === true), "every attempt timed out");
    });
  });
});
