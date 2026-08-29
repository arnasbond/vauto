/**
 * VAUTO AI Maturity — Phase 2A audit remediation.
 *
 * CLIENT/CONTEXT INTEGRATION TEST covering the part of the pipeline the
 * first Phase 2A pass stopped short of: `agent-quick-reply-bare-confirmation.test.ts`
 * proves a bare "taip" is unhandled by `tryHandleAgentQuickReply()`, but an
 * unhandled quick reply is NOT a dead end in production — VautoAgentContext's
 * `sendAgentMessage` forwards it to the real network call,
 * `apiVautoAgentStream()` (`src/lib/api/vauto-agent-stream.ts`).
 *
 * This file exercises the REAL `apiVautoAgentStream()` function end-to-end —
 * real SSE parsing, real request construction — with ONLY the network
 * boundary (`global.fetch`) and the two browser-only globals it touches
 * (`window.setTimeout`/`clearTimeout`, `window.location`) shimmed (no
 * jsdom/React renderer; this is a plain Node process). Its parsed `actions`
 * output is then routed through the REAL sideEffect handlers proven in
 * `consequential-action-dialog-handler.test.ts`, closing the full
 * UI(quick-reply) → agent(stream) → sideEffect → confirmation-endpoint path
 * for the bare-confirmation scenario.
 *
 * Required guarantees proven here for a standalone "taip" with no trusted
 * pending sideEffect:
 *   - it is actually forwarded to `apiVautoAgentStream()` (continuation is
 *     exercised, not assumed);
 *   - receiving ANY stream response — including one where a confused/
 *     over-eager model attempted a consequential tool call — never by
 *     itself calls `/api/consequential-actions/confirm`, never calls a
 *     mutation executor, never opens/executes without a fresh human
 *     confirm step, and can only ever produce a NEW pending proposal
 *     (never an already-executed result — that shape does not exist
 *     server-side per the Phase 1 tool boundary, proven independently in
 *     `server/src/ai/__tests__/consequential-action-tools.test.ts` and
 *     `server/src/routes/__tests__/consequential-actions-chat-boundary.test.ts`);
 *   - a response that carries NO consequential sideEffect at all leaves an
 *     unrelated, already-open confirm dialog completely untouched (a bare
 *     "taip" reply about something else can never silently confirm an
 *     earlier action).
 */
import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { apiVautoAgentStream } from "../api/vauto-agent-stream.js";
import { createConfirmDialogController } from "../confirm-dialog-queue.js";
import {
  handleMarkListingSoldSideEffect,
  type ConfirmDialogPrompt,
} from "../consequential-action-dialog-handler.js";
import { tryHandleAgentQuickReply, type AgentQuickReplyDeps } from "../agent-quick-reply-router.js";
import type { UserProfile } from "../types.js";

process.env.NEXT_PUBLIC_API_URL = "http://test-api.local";

// Minimal, dependency-free shim for the only two browser globals
// `apiVautoAgentStream()` touches — no jsdom, no React renderer.
(globalThis as unknown as { window: unknown }).window = {
  setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
  clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
  location: { origin: "http://window-origin.invalid" },
};

const USER: UserProfile = {
  id: "user-1",
  name: "Jonas Jonaitis",
  avatar: "",
  phone: "+37060000000",
  city: "Vilnius",
  role: "private",
};

function sseFinalEvent(result: unknown): string {
  return `data: ${JSON.stringify({ type: "final", result })}\n\n`;
}

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

function installFetchMock(streamBody: string) {
  const streamCalls: FetchCall[] = [];
  const confirmCalls: FetchCall[] = [];
  const cancelCalls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (url.endsWith("/api/vauto-agent/stream")) {
      streamCalls.push({ url, body });
      return new Response(streamBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    if (url.endsWith("/api/consequential-actions/confirm")) {
      confirmCalls.push({ url, body });
      return new Response(
        JSON.stringify({ ok: true, replay: false, result: { ok: true, listingId: body.targetId } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/api/consequential-actions/cancel")) {
      cancelCalls.push({ url, body });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  return {
    streamCalls,
    confirmCalls,
    cancelCalls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function baseQuickReplyDeps(overrides: Partial<AgentQuickReplyDeps> = {}): AgentQuickReplyDeps {
  return {
    trimmed: "",
    user: USER,
    searchQuery: "",
    isAuthenticated: true,
    aiDraft: null,
    sellerStep: "idle",
    pendingWardrobeBulkItems: null,
    pendingWardrobeVoice: null,
    lastBargainingOffer: null,
    publishListing: async () => {
      throw new Error("publishListing must never be invoked from a bare confirmation alone");
    },
    requestPublishUpsell: () => ({ handled: true, reply: "upsell" }),
    confirmPublishNow: () => {
      throw new Error("confirmPublishNow should not be reached for a bare confirmation with no draft context");
    },
    buildPrePublishMissingGuide: () => "guide",
    getPrePublishReadiness: () => null,
    publishBulkClothingListings: () => {},
    applyAgentWardrobeBulk: () => {},
    activateWardrobeSpinta: () => {},
    routeZeroUiScreen: () => {},
    openMicroPayment: () => {},
    resolveSmartBoostPrice: () => 4.99,
    navigateToAdd: () => {},
    applyAgentListingDraft: () => {},
    routerPush: () => {},
    goToDiscover: () => {},
    broadenSearch: () => {},
    registerWantedFlow: () => {},
    openChats: () => {},
    openBargainingChat: () => false,
    openAuthModal: () => {},
    searchSimilarListings: () => {},
    revertPhotoCategoryMismatch: () => false,
    acceptPhotoCategoryMismatch: () => {},
    ...overrides,
  };
}

describe("Phase 2A — full bare-confirmation path: quick-reply router -> real apiVautoAgentStream() -> real sideEffect handlers", () => {
  let mock: ReturnType<typeof installFetchMock>;

  afterEach(() => {
    mock?.restore();
  });

  it('a bare "taip" is unhandled by the quick-reply router AND, once forwarded to the real stream call, a plain natural reply never touches any consequential-action endpoint', async () => {
    const quickReply = tryHandleAgentQuickReply(baseQuickReplyDeps({ trimmed: "taip" }));
    assert.equal(quickReply, null, "precondition: the router must not have handled this");

    mock = installFetchMock(
      sseFinalEvent({
        ok: true,
        reply: "Kuo galiu padėti?",
        toolCalls: [],
        actions: { type: "none" },
      })
    );

    const events: unknown[] = [];
    const result = await apiVautoAgentStream(
      { message: "taip", context: {} } as unknown as Parameters<typeof apiVautoAgentStream>[0],
      { onEvent: (e) => events.push(e) }
    );

    assert.equal(mock.streamCalls.length, 1, "the continuation to apiVautoAgentStream() must actually happen");
    assert.equal(mock.streamCalls[0]!.body.message, "taip");
    assert.ok(result.ok);
    assert.deepEqual((result as { actions: { type: string } }).actions, { type: "none" });
    assert.equal(mock.confirmCalls.length, 0, 'a bare "taip" must never call /confirm');
    assert.equal(mock.cancelCalls.length, 0);
  });

  it('a bare "taip" that causes the model to attempt a consequential tool call can only ever produce a NEW pending proposal — receiving it never executes, never opens without a confirm step, and the id is exactly the one the server minted (never reconstructed from "taip")', async () => {
    const FRESH_PENDING_ID = "fresh-pending-triggered-by-taip";
    mock = installFetchMock(
      sseFinalEvent({
        ok: true,
        reply: 'Prašau patvirtinti pokalbio lange: pažymėti skelbimą kaip parduotą?',
        toolCalls: [{ name: "markListingSold", result: { ok: true, pending: true } }],
        actions: {
          type: "mark_listing_sold",
          listingId: "listing-1",
          title: "BMW 320d",
          pendingActionId: FRESH_PENDING_ID,
          expiresAt: new Date(Date.now() + 180_000).toISOString(),
        },
      })
    );

    const result = await apiVautoAgentStream(
      { message: "taip", context: {} } as unknown as Parameters<typeof apiVautoAgentStream>[0],
      { onEvent: () => {} }
    );
    assert.ok(result.ok);

    // Merely receiving the response — before any UI handling — must never
    // itself have touched the confirmation endpoint.
    assert.equal(mock.confirmCalls.length, 0, "receiving a proposal must never itself execute it");
    assert.equal(mock.cancelCalls.length, 0);

    const actions = (result as { actions: unknown }).actions as {
      type: string;
      listingId: string;
      title?: string;
      pendingActionId: string;
    };
    assert.equal(actions.type, "mark_listing_sold");
    // The id used downstream is EXACTLY the structured field the server
    // returned — there is no code path that derives/reconstructs an id
    // from the chat text "taip" itself.
    assert.equal(actions.pendingActionId, FRESH_PENDING_ID);

    // Route it through the REAL sideEffect handler (mirrors VautoAgentContext's
    // `actions.type === "mark_listing_sold"` branch verbatim).
    const controller = createConfirmDialogController<ConfirmDialogPrompt>();
    const marked: string[] = [];
    const pending = handleMarkListingSoldSideEffect(
      { listingId: actions.listingId, title: actions.title, pendingActionId: actions.pendingActionId },
      {
        showConfirm: controller.show,
        onSuccess: () => {},
        onError: () => {},
        onMarkedSold: (id) => marked.push(id),
      }
    );

    // A dialog is now REQUIRED before anything executes — a bare "taip"
    // never bypasses this, even though "taip" is what triggered the tool
    // call in the first place.
    assert.ok(controller.current(), "a fresh proposal must always require an explicit confirm dialog");
    assert.equal(mock.confirmCalls.length, 0, "still zero /confirm calls while the dialog is unanswered");
    assert.deepEqual(marked, []);

    // If the human never answers, it never executes.
    assert.equal(mock.confirmCalls.length, 0);

    controller.dismiss(false); // let the pending() promise settle so the test exits cleanly
    await pending;
    assert.equal(mock.cancelCalls.length, 1);
    assert.equal(mock.confirmCalls.length, 0, "declining leaves the mutation executor untouched");
  });

  it('a bare "taip" whose stream response carries NO consequential sideEffect leaves an EARLIER, already-open, unrelated confirm dialog completely untouched (cannot silently confirm an earlier action)', async () => {
    const controller = createConfirmDialogController<ConfirmDialogPrompt>();
    // An earlier, unrelated proposal is still open from a previous turn.
    const earlierPending = handleMarkListingSoldSideEffect(
      { listingId: "listing-earlier", title: "Sofa", pendingActionId: "pa-earlier" },
      { showConfirm: controller.show, onSuccess: () => {}, onError: () => {}, onMarkedSold: () => {} }
    );
    const dialogBefore = controller.current();
    assert.ok(dialogBefore);

    mock = installFetchMock(
      sseFinalEvent({
        ok: true,
        reply: "Kuo galiu padėti?",
        toolCalls: [],
        actions: { type: "none" },
      })
    );
    const result = await apiVautoAgentStream(
      { message: "taip", context: {} } as unknown as Parameters<typeof apiVautoAgentStream>[0],
      { onEvent: () => {} }
    );
    assert.ok(result.ok);
    assert.equal((result as { actions: { type: string } }).actions.type, "none");

    // The unrelated earlier dialog must be EXACTLY as it was — same prompt,
    // never auto-resolved by this unrelated "taip" turn.
    assert.deepEqual(controller.current(), dialogBefore);
    assert.equal(mock.confirmCalls.length, 0);
    assert.equal(mock.cancelCalls.length, 0);

    controller.dismiss(false);
    await earlierPending;
  });
});
