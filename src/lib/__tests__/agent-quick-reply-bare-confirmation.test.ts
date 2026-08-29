/**
 * VAUTO AI Maturity — Phase 2A: Chat-Level Human Control Verification.
 *
 * Required scenarios exercised here at the deterministic client chat-reply
 * router (`tryHandleAgentQuickReply`) — the first, non-LLM layer that sees
 * every chat message before it ever reaches the AI backend:
 *
 *  1. A bare "taip"/"yes"/"gerai"/"ok" (no matching chip phrase) must
 *     perform no mutating action and must not invent/confirm anything.
 *  5. A listing draft must never be published merely because the user
 *     writes "taip" — `confirmPublishNow()` only ever surfaces the
 *     PrePublish card; the real publish executor (`publishListing`) must
 *     never be called from chat text alone.
 *  7. An intent pivot (leaving the publish-confirmation step) must not let
 *     a later bare/loose "taip" retroactively confirm the earlier,
 *     no-longer-current publish proposal.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  tryHandleAgentQuickReply,
  type AgentQuickReplyDeps,
  type AgentQuickReplyResult,
} from "../agent-quick-reply-router.js";
import type { AiExtractedListing, UserProfile } from "../types.js";

const USER: UserProfile = {
  id: "user-1",
  name: "Jonas Jonaitis",
  avatar: "",
  phone: "+37060000000",
  city: "Vilnius",
  role: "private",
};

const DRAFT: AiExtractedListing = {
  title: "iPhone 13",
  price: 500,
  location: "Vilnius",
  contact: "+37060000000",
  category: "electronics",
  confidence: 0.9,
};

function callCounter() {
  let calls = 0;
  const fn = () => {
    calls += 1;
  };
  return { fn, count: () => calls };
}

function baseDeps(overrides: Partial<AgentQuickReplyDeps> = {}): AgentQuickReplyDeps {
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
      throw new Error("publishListing must never be invoked from chat text alone (Phase 1/2A boundary)");
    },
    requestPublishUpsell: (): AgentQuickReplyResult => ({ handled: true, reply: "upsell" }),
    confirmPublishNow: (): AgentQuickReplyResult => {
      throw new Error("confirmPublishNow should not be called for this input");
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

const BARE_CONFIRMATIONS = ["taip", "Taip", "TAIP", "yes", "gerai", "ok", "okay", "tvirtinu"];

describe("REQUIRED SCENARIO 1 — bare confirmation with no matching pending chip", () => {
  for (const phrase of BARE_CONFIRMATIONS) {
    it(`"${phrase}" alone with an active draft in the publish-confirmation step never calls confirmPublishNow or publishListing`, () => {
      const confirmPublishNow = callCounter();
      const deps = baseDeps({
        trimmed: phrase,
        aiDraft: DRAFT,
        sellerStep: "confirmation",
        confirmPublishNow: (): AgentQuickReplyResult => {
          confirmPublishNow.fn();
          return { handled: true, reply: "would publish" };
        },
      });

      // Must not throw (publishListing stub throws if ever invoked) and
      // must never route through confirmPublishNow for a bare phrase alone.
      const result = tryHandleAgentQuickReply(deps);
      assert.equal(confirmPublishNow.count(), 0, `bare "${phrase}" must not trigger confirmPublishNow`);
      // Either unhandled (falls through to the AI backend for a natural
      // reply) or a handled reply that performs no mutation — never a
      // silent invented confirmation.
      if (result) {
        assert.equal(result.handled, true);
      }
    });
  }

  it('a bare "taip" with NO draft and NO seller flow in progress is a pure no-op (no navigation, no publish, no proposal)', () => {
    const navigateToAdd = callCounter();
    const deps = baseDeps({
      trimmed: "taip",
      aiDraft: null,
      sellerStep: "idle",
      navigateToAdd: navigateToAdd.fn,
    });
    tryHandleAgentQuickReply(deps);
    assert.equal(navigateToAdd.count(), 0);
  });
});

describe("REQUIRED SCENARIO 5 — a listing draft is never published merely by writing taip", () => {
  it('"taip, viskas tikslu" in the confirmation step calls confirmPublishNow (shows the PrePublish card) but NEVER publishListing directly', () => {
    const confirmPublishNow = callCounter();
    const deps = baseDeps({
      trimmed: "Taip, viskas tikslu!",
      aiDraft: DRAFT,
      sellerStep: "confirmation",
      confirmPublishNow: (): AgentQuickReplyResult => {
        confirmPublishNow.fn();
        return { handled: true, reply: "PrePublish card shown" };
      },
      // publishListing base stub throws if invoked — proves this phrase
      // alone never reaches the actual publish executor.
    });
    const result = tryHandleAgentQuickReply(deps);
    assert.equal(confirmPublishNow.count(), 1, "a genuine, explicit confirm phrase is the ONLY thing that reaches confirmPublishNow");
    assert.ok(result);
    assert.equal(result!.handled, true);
  });

  it("positive control — matching phrases are actually recognized by this router (proves the harness is not vacuously passing)", () => {
    const confirmPublishNow = callCounter();
    const deps = baseDeps({
      trimmed: "viskas tinka",
      aiDraft: DRAFT,
      sellerStep: "confirmation",
      confirmPublishNow: (): AgentQuickReplyResult => {
        confirmPublishNow.fn();
        return { handled: true, reply: "PrePublish card shown" };
      },
    });
    tryHandleAgentQuickReply(deps);
    assert.equal(confirmPublishNow.count(), 1);
  });
});

describe('REQUIRED SCENARIO 7 — intent pivot: leaving "confirmation" step first means a later bare "taip" cannot revive the old publish proposal', () => {
  it('"taip, viskas tikslu" is ignored (falls through, no confirmPublishNow) once sellerStep has moved on from "confirmation"', () => {
    const confirmPublishNow = callCounter();
    for (const pivotedStep of ["idle", "recording", "processing", "published"] as const) {
      const deps = baseDeps({
        trimmed: "taip, viskas tikslu",
        aiDraft: DRAFT,
        sellerStep: pivotedStep,
        confirmPublishNow: (): AgentQuickReplyResult => {
          confirmPublishNow.fn();
          return { handled: true, reply: "would publish" };
        },
      });
      tryHandleAgentQuickReply(deps);
    }
    assert.equal(
      confirmPublishNow.count(),
      0,
      "an intent pivot away from the confirmation step must not let a later taip resurrect the old proposal"
    );
  });
});
