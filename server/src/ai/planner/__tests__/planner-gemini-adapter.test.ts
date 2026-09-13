/**
 * R4.3A — planner provider resilience (deterministic, NO live Gemini).
 *
 * Stubs global fetch to prove bounded retry/fallback behavior:
 *   - transient 429/503 retried → real decision returned;
 *   - repeated retryable failures → bounded exhaustion (honest fallback);
 *   - non-retryable 4xx → no useless retry;
 *   - structured-output failure ≠ provider overload;
 *   - fallback model used after primary exhaustion;
 *   - max attempts bounded; no duplicated execution.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createGeminiPlannerAdapter } from "../planner-gemini-adapter.js";
import {
  PlannerProviderUnavailableError,
  PlannerStructuredOutputError,
  type PlannerStructuredRequest,
} from "../planner-provider.js";

const REQ: PlannerStructuredRequest = {
  systemInstruction: "test",
  parts: {
    stateBlock: "",
    memoryBlock: "",
    salientMemoryBlock: "",
    factsBlock: "",
    goalBlock: "",
    pendingBlock: "",
    historyBlock: "",
    lastUserText: "Surask Volvo",
  },
  schemaName: "planTurn",
  schemaJson: { type: "OBJECT" },
};

const VALID_ARGS = {
  intent: "catalog_search",
  goal: "search",
  continuationOf: "none",
  action: "catalog_search",
  tool: "searchListings",
  toolArgs: {},
  needsClarification: false,
  confidence: 0.9,
  reasons: [],
};

const OK_BODY = {
  candidates: [
    { content: { parts: [{ functionCall: { name: "planTurn", args: VALID_ARGS } }] } },
  ],
};

const NO_CALL_BODY = {
  candidates: [{ content: { parts: [{ text: "atsiprašau, negaliu" }] } }],
};

/** Fast deterministic timing (production defaults are never changed). */
const FAST = { retryBaseMs: 1, retry429BaseMs: 1, totalBudgetMs: 5_000 };

interface FetchStep {
  status: number;
  body: unknown;
}

function installFetch(script: FetchStep[]) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    calls.push(url);
    const step = script[Math.min(i, script.length - 1)]!;
    i += 1;
    return new Response(JSON.stringify(step.body), {
      status: step.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/** A provider request that never resolves unless the abort signal fires. */
function installHangingFetch() {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push(String(input));
    const signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () =>
        reject(new Error("Aborted"))
      );
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function plan(script: FetchStep[], model?: string, timing?: Parameters<typeof createGeminiPlannerAdapter>[1]) {
  const fetchMock = installFetch(script);
  process.env.GEMINI_API_KEY = "r43a-test-key";
  const adapter = createGeminiPlannerAdapter(model, timing ?? FAST);
  return { adapter, fetchMock };
}

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("R4.3A — planner provider resilience", () => {
  it("1. transient 503 then success → real planner decision returned", async () => {
    const { adapter, fetchMock } = plan([
      { status: 503, body: { error: "overloaded" } },
      { status: 200, body: OK_BODY },
    ]);
    const res = await adapter.planStructured(REQ);
    assert.equal(res.args.intent, "catalog_search");
    assert.equal(res.model, "gemini-2.5-flash");
    assert.equal(res.attempts, 2);
    assert.deepEqual(res.modelsTried, ["gemini-2.5-flash"]);
    assert.equal(fetchMock.calls.length, 2);
    fetchMock.restore();
  });

  it("2. transient 429 then success → real planner decision returned", async () => {
    const { adapter, fetchMock } = plan([
      { status: 429, body: { error: "rate limited" } },
      { status: 200, body: OK_BODY },
    ]);
    const res = await adapter.planStructured(REQ);
    assert.equal(res.args.intent, "catalog_search");
    assert.equal(res.attempts, 2);
    assert.equal(fetchMock.calls.length, 2);
    fetchMock.restore();
  });

  it("3. repeated retryable failures → bounded exhaustion (honest fallback)", async () => {
    const { adapter, fetchMock } = plan([
      { status: 503, body: { error: "overloaded" } },
    ]);
    await assert.rejects(
      () => adapter.planStructured(REQ),
      (e: unknown) => {
        assert.ok(e instanceof PlannerProviderUnavailableError);
        assert.equal((e as PlannerProviderUnavailableError).retryExhausted, true);
        assert.equal((e as PlannerProviderUnavailableError).attempts, 6);
        assert.deepEqual(
          (e as PlannerProviderUnavailableError).modelsTried,
          ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
        );
        return true;
      }
    );
    assert.equal(fetchMock.calls.length, 6);
    fetchMock.restore();
  });

  it("4. non-retryable 4xx → no useless retry / no fallback", async () => {
    const { adapter, fetchMock } = plan([
      { status: 400, body: { error: "bad request" } },
    ]);
    await assert.rejects(
      () => adapter.planStructured(REQ),
      (e: unknown) => {
        assert.ok(e instanceof PlannerProviderUnavailableError);
        assert.equal((e as PlannerProviderUnavailableError).retryExhausted, false);
        assert.equal((e as PlannerProviderUnavailableError).attempts, 1);
        assert.deepEqual((e as PlannerProviderUnavailableError).modelsTried, ["gemini-2.5-flash"]);
        return true;
      }
    );
    assert.equal(fetchMock.calls.length, 1);
    fetchMock.restore();
  });

  it("4b. HTTP 401 → exactly one call, no fallback", async () => {
    const { adapter, fetchMock } = plan([
      { status: 401, body: { error: "unauthorized" } },
    ]);
    await assert.rejects(() => adapter.planStructured(REQ), PlannerProviderUnavailableError);
    assert.equal(fetchMock.calls.length, 1);
    fetchMock.restore();
  });

  it("4c. HTTP 403 → exactly one call, no fallback", async () => {
    const { adapter, fetchMock } = plan([
      { status: 403, body: { error: "forbidden" } },
    ]);
    await assert.rejects(() => adapter.planStructured(REQ), PlannerProviderUnavailableError);
    assert.equal(fetchMock.calls.length, 1);
    fetchMock.restore();
  });

  it("5. structured-output failure is NOT provider overload (no retry)", async () => {
    const { adapter, fetchMock } = plan([
      { status: 200, body: NO_CALL_BODY },
    ]);
    await assert.rejects(
      () => adapter.planStructured(REQ),
      (e: unknown) => {
        assert.ok(e instanceof PlannerStructuredOutputError);
        return true;
      }
    );
    assert.equal(fetchMock.calls.length, 1);
    fetchMock.restore();
  });

  it("6. primary exhausted → configured fallback model used", async () => {
    const { adapter, fetchMock } = plan([
      { status: 503, body: { error: "overloaded" } },
      { status: 503, body: { error: "overloaded" } },
      { status: 503, body: { error: "overloaded" } },
      { status: 200, body: OK_BODY },
    ]);
    const res = await adapter.planStructured(REQ);
    assert.equal(res.model, "gemini-2.5-flash-lite");
    assert.deepEqual(res.modelsTried, ["gemini-2.5-flash", "gemini-2.5-flash-lite"]);
    assert.equal(res.attempts, 4);
    fetchMock.restore();
  });

  it("7. max attempts are bounded (2 models × 3 attempts)", async () => {
    const { adapter, fetchMock } = plan([
      { status: 503, body: { error: "overloaded" } },
    ]);
    await assert.rejects(() => adapter.planStructured(REQ));
    assert.equal(fetchMock.calls.length, 6);
    fetchMock.restore();
  });

  it("8. no duplicated execution — retry only re-issues the read-only planner call", async () => {
    const { adapter, fetchMock } = plan([
      { status: 503, body: { error: "overloaded" } },
      { status: 200, body: OK_BODY },
    ]);
    const res = await adapter.planStructured(REQ);
    // The adapter returns EXACTLY one decision and issues exactly `attempts`
    // read-only generateContent calls — no tool/action side effects happen here.
    assert.equal(res.args.intent, "catalog_search");
    assert.equal(fetchMock.calls.length, 2);
    // Every call was to the read-only generateContent endpoint (same shape).
    for (const url of fetchMock.calls) {
      assert.match(url, /generateContent$/);
    }
    fetchMock.restore();
  });

  it("9. total budget is a hard ceiling — a hanging request cannot exceed it", async () => {
    const fetchMock = installHangingFetch();
    process.env.GEMINI_API_KEY = "r43a-test-key";
    // Small budget (100ms) so a single attempt's timeout is capped by the
    // REMAINING budget, never by the general 120s Gemini timeout.
    const adapter = createGeminiPlannerAdapter(undefined, {
      retryBaseMs: 1,
      retry429BaseMs: 1,
      totalBudgetMs: 100,
    });
    const started = Date.now();
    try {
      await assert.rejects(
        () => adapter.planStructured(REQ),
        (e: unknown) => {
          assert.ok(e instanceof PlannerProviderUnavailableError);
          assert.equal((e as PlannerProviderUnavailableError).retryExhausted, true);
          return true;
        }
      );
      const elapsed = Date.now() - started;
      // The whole recovery sequence must stop around the 100ms budget, not the
      // 120s general timeout.
      assert.ok(elapsed < 2_000, `elapsed ${elapsed}ms must be bounded by the 100ms budget`);
      assert.equal(fetchMock.calls.length, 1);
    } finally {
      fetchMock.restore();
    }
  });

  it("10. backoff sleep is bounded by the remaining budget (no oversleep)", async () => {
    // A 429 backoff of 2500ms must be capped by the 300ms total budget.
    const { adapter, fetchMock } = plan(
      [{ status: 429, body: { error: "rate limited" } }],
      undefined,
      { retryBaseMs: 1, retry429BaseMs: 2_500, totalBudgetMs: 300 }
    );
    const started = Date.now();
    try {
      await assert.rejects(
        () => adapter.planStructured(REQ),
        (e: unknown) => {
          assert.ok(e instanceof PlannerProviderUnavailableError);
          assert.equal((e as PlannerProviderUnavailableError).retryExhausted, true);
          return true;
        }
      );
      const elapsed = Date.now() - started;
      // If the 2500ms backoff were NOT capped, elapsed would exceed 2500ms.
      assert.ok(elapsed < 1_500, `elapsed ${elapsed}ms must be bounded by the 300ms budget`);
      // No extra provider attempt begins after budget exhaustion.
      assert.equal(fetchMock.calls.length, 1);
    } finally {
      fetchMock.restore();
    }
  });
});
