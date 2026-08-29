/**
 * VAUTO AI Maturity — Phase 2A audit remediation.
 *
 * CLIENT/CONTEXT INTEGRATION TEST (not a browser E2E test, not a pure unit
 * test of an isolated primitive). This exercises, together, in their real
 * production form:
 *   - the REAL sideEffect handlers `handleBlockListingSideEffect` /
 *     `handleMarkListingSoldSideEffect` (`consequential-action-dialog-handler.ts`)
 *     — the exact functions `VautoAgentContext.tsx` calls verbatim from its
 *     `block_listing` / `mark_listing_sold` action branches;
 *   - the REAL `createConfirmDialogController` (`confirm-dialog-queue.ts`)
 *     — the exact controller `VautoContext.tsx`'s `showConfirm()` is backed
 *     by, wired the same way (single instance, `show`/`dismiss`/`current`);
 *   - the REAL `apiConfirmConsequentialAction` / `apiCancelConsequentialAction`
 *     client wrapper (`consequential-action-confirm.ts`), with ONLY the
 *     network boundary (`global.fetch`) intercepted — the wrapper's own
 *     request-building, base-URL resolution, and response parsing all run
 *     for real.
 *
 * What is NOT exercised here (intentionally, and not claimed): rendering
 * `VautoAgentContext`/`VautoProvider` themselves, `tryHandleAgentQuickReply`,
 * or `apiVautoAgentStream` — those are covered by
 * `agent-quick-reply-bare-confirmation.test.ts` and
 * `vauto-agent-stream-continuation.test.ts` respectively. No jsdom/React
 * renderer is used or required.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { createConfirmDialogController } from "../confirm-dialog-queue.js";
import {
  handleBlockListingSideEffect,
  handleMarkListingSoldSideEffect,
  type ConfirmDialogPrompt,
} from "../consequential-action-dialog-handler.js";

process.env.NEXT_PUBLIC_API_URL = "http://test-api.local";

interface FetchCall {
  path: string;
  body: Record<string, unknown>;
}

function installFetchMock() {
  const confirmCalls: FetchCall[] = [];
  const cancelCalls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (url.endsWith("/api/consequential-actions/confirm")) {
      confirmCalls.push({ path: url, body });
      return new Response(
        JSON.stringify({
          ok: true,
          replay: false,
          result: { ok: true, listingId: body.targetId, title: "Mock title" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/api/consequential-actions/cancel")) {
      cancelCalls.push({ path: url, body });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  return {
    confirmCalls,
    cancelCalls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function recordingCallbacks() {
  const successes: string[] = [];
  const errors: string[] = [];
  const banned: string[] = [];
  const markedSold: string[] = [];
  return {
    onSuccess: (m: string) => successes.push(m),
    onError: (m: string) => errors.push(m),
    onBanned: (id: string) => banned.push(id),
    onMarkedSold: (id: string) => markedSold.push(id),
    successes,
    errors,
    banned,
    markedSold,
  };
}

describe("Phase 2A — client/context integration: real sideEffect handlers + real confirm-dialog controller + real client wrapper", () => {
  let mock: ReturnType<typeof installFetchMock>;

  beforeEach(() => {
    mock = installFetchMock();
  });

  afterEach(() => {
    mock.restore();
  });

  it("REQUIRED SCENARIO 4 (positive control) — a single genuine sideEffect: dialog opens, confirming sends exactly its own pendingActionId, and executes once", async () => {
    const controller = createConfirmDialogController<ConfirmDialogPrompt>();
    const cb = recordingCallbacks();

    const pending = handleMarkListingSoldSideEffect(
      { listingId: "listing-1", title: "BMW 320d", pendingActionId: "pa-1" },
      { showConfirm: controller.show, onSuccess: cb.onSuccess, onError: cb.onError, onMarkedSold: cb.onMarkedSold }
    );

    assert.ok(controller.current(), "dialog must be open while awaiting the user's answer");
    controller.dismiss(true);
    await pending;

    assert.equal(mock.confirmCalls.length, 1);
    assert.deepEqual(mock.confirmCalls[0]!.body, {
      pendingActionId: "pa-1",
      type: "markListingSold",
      targetId: "listing-1",
    });
    assert.equal(mock.cancelCalls.length, 0);
    assert.deepEqual(cb.markedSold, ["listing-1"]);
    assert.equal(cb.successes.length, 1);
    assert.equal(cb.errors.length, 0);
  });

  it("REQUIRED SCENARIO 7 — sideEffect A opens dialog A; sideEffect B arriving before A is answered resolves A false, sends A's cancel with A's exact id, leaves B current, and confirming B sends only B's exact id — neither executes more than once", async () => {
    const controller = createConfirmDialogController<ConfirmDialogPrompt>();
    const cbA = recordingCallbacks();
    const cbB = recordingCallbacks();

    // sideEffect A: block listing A.
    const pendingA = handleBlockListingSideEffect(
      { listingId: "listing-A", reason: "suspicious", pendingActionId: "pa-A" },
      { showConfirm: controller.show, onSuccess: cbA.onSuccess, onError: cbA.onError, onBanned: cbA.onBanned }
    );
    const dialogA = controller.current();
    assert.ok(dialogA, "dialog A must be visible");
    assert.match(dialogA!.message, /listing-A|Užblokuoti/);

    // Intent pivot: sideEffect B arrives (mark a DIFFERENT listing sold)
    // before the user has answered dialog A.
    const pendingB = handleMarkListingSoldSideEffect(
      { listingId: "listing-B", title: "iPhone 13", pendingActionId: "pa-B" },
      { showConfirm: controller.show, onSuccess: cbB.onSuccess, onError: cbB.onError, onMarkedSold: cbB.onMarkedSold }
    );

    // A must resolve on its own (false) — its handler runs its cancel branch.
    await pendingA;
    assert.equal(mock.cancelCalls.length, 1, "A's supersede must trigger exactly one /cancel call");
    assert.deepEqual(mock.cancelCalls[0]!.body, { pendingActionId: "pa-A" });
    assert.equal(mock.confirmCalls.length, 0, "A must never reach /confirm");
    assert.deepEqual(cbA.banned, []);
    assert.deepEqual(cbA.successes, []);
    assert.deepEqual(cbA.errors, []);

    // Only dialog B is now visible/current.
    const dialogB = controller.current();
    assert.ok(dialogB);
    assert.match(dialogB!.message, /listing-B|iPhone 13|parduotą/);

    // The user answers what they actually see (dialog B) — confirm.
    controller.dismiss(true);
    await pendingB;

    assert.equal(mock.confirmCalls.length, 1, "confirming B must send exactly ONE /confirm call");
    assert.deepEqual(mock.confirmCalls[0]!.body, {
      pendingActionId: "pa-B",
      type: "markListingSold",
      targetId: "listing-B",
    });
    assert.deepEqual(cbB.markedSold, ["listing-B"]);
    assert.equal(cbB.successes.length, 1);

    // Final tally across the whole pivot: A executed zero times, B executed
    // exactly once — neither action ever executes more than once.
    assert.equal(mock.confirmCalls.filter((c) => c.body.pendingActionId === "pa-A").length, 0);
    assert.equal(mock.confirmCalls.filter((c) => c.body.pendingActionId === "pa-B").length, 1);
    assert.equal(mock.cancelCalls.filter((c) => c.body.pendingActionId === "pa-A").length, 1);
    assert.equal(mock.cancelCalls.filter((c) => c.body.pendingActionId === "pa-B").length, 0);
  });

  it("user explicitly cancelling (not a pivot) sends /cancel with the exact id and never calls /confirm", async () => {
    const controller = createConfirmDialogController<ConfirmDialogPrompt>();
    const cb = recordingCallbacks();

    const pending = handleBlockListingSideEffect(
      { listingId: "listing-9", reason: "spam", pendingActionId: "pa-9" },
      { showConfirm: controller.show, onSuccess: cb.onSuccess, onError: cb.onError, onBanned: cb.onBanned }
    );
    controller.dismiss(false);
    await pending;

    assert.equal(mock.cancelCalls.length, 1);
    assert.deepEqual(mock.cancelCalls[0]!.body, { pendingActionId: "pa-9" });
    assert.equal(mock.confirmCalls.length, 0);
    assert.deepEqual(cb.banned, []);
  });

  it("a server-side rejection (e.g. already consumed) surfaces via onError, never via onBanned/onMarkedSold", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/consequential-actions/confirm")) {
        return new Response(JSON.stringify({ error: "Veiksmas buvo atšauktas.", replay: false }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch to ${url}`);
    }) as typeof fetch;

    const controller = createConfirmDialogController<ConfirmDialogPrompt>();
    const cb = recordingCallbacks();
    const pending = handleMarkListingSoldSideEffect(
      { listingId: "listing-1", title: "BMW 320d", pendingActionId: "pa-stale" },
      { showConfirm: controller.show, onSuccess: cb.onSuccess, onError: cb.onError, onMarkedSold: cb.onMarkedSold }
    );
    controller.dismiss(true);
    await pending;

    assert.deepEqual(cb.markedSold, []);
    assert.equal(cb.errors.length, 1);
    assert.equal(cb.successes.length, 0);
  });
});
