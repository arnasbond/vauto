/**
 * E1 — Core v2 adapter integration test.
 *
 * Verifies that the adapter correctly bridges Thread Service to Core v2
 * while preserving the existing contract and authority semantics.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  threadRecordToBuyerSession,
  buyerTurnRecordToVautoResponse,
  extractImageUrlsFromContext,
  CORE_V2_ENABLED,
} from "../core-v2-adapter.js";
import { emptyMarketplaceState } from "../../ai-core-v2/state/marketplace-state.js";
import { analyzePhotoCapability } from "../../ai-core-v2/capability/capabilities/analyze-photo.js";
import type { ThreadRecord } from "../thread-store.js";
import type { VautoAgentRequest } from "../agent-types.js";

describe("E1 — Core v2 adapter", () => {
  it("preserves feature flag for controlled rollout", () => {
    // Feature flag should be explicitly controllable.
    assert.strictEqual(typeof CORE_V2_ENABLED, "boolean");
  });

  it("translates ThreadRecord to BuyerSession without promoting legacy state", () => {
    const thread: ThreadRecord = {
      threadId: "test-thread",
      ownerUserId: "user-123",
      anonSessionTokenHash: null,
      version: 1,
      messages: [
        { role: "user", text: "Sveiki", at: "2024-01-01T00:00:00Z", seq: 1 },
        { role: "assistant", text: "Sveiki! Kaip galiu padėti?", at: "2024-01-01T00:00:01Z", seq: 2 },
      ],
      lastTurnId: "turn-1",
      listingDraft: { title: "Test listing", price: 100 },
      listingFlowState: "DRAFTING_TEXT",
      searchContext: { category: "vehicles" },
      pendingConfirmations: [],
      currentIntent: "search",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:01Z",
    };

    const userContext: VautoAgentRequest["context"] = {
      userCity: "Vilnius",
    };

    const session = threadRecordToBuyerSession(thread, userContext);

    // History should be preserved.
    assert.strictEqual(session.history.length, 2);
    assert.strictEqual(session.history[0].text, "Sveiki");
    assert.strictEqual(session.history[1].text, "Sveiki! Kaip galiu padėti?");

    // State should start fresh (no legacy promotion).
    assert.deepStrictEqual(session.state.version, "2.1");
    assert.strictEqual(session.state.goal, undefined);

    // BLOCKER 1: userCity should NOT be promoted to USER_STATED authority.
    assert.strictEqual(session.state.hardConstraints.location, undefined);
    assert.strictEqual(session.state.hardConstraintProvenance.location, undefined);

    // Result context should be empty (no prior search).
    assert.strictEqual(session.resultContext.listings.length, 0);
  });

  it("handles empty thread gracefully", () => {
    const thread: ThreadRecord = {
      threadId: "new-thread",
      ownerUserId: null,
      anonSessionTokenHash: "hash-123",
      version: 1,
      messages: [],
      lastTurnId: null,
      listingDraft: null,
      listingFlowState: null,
      searchContext: null,
      pendingConfirmations: [],
      currentIntent: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    const session = threadRecordToBuyerSession(thread, {});

    assert.strictEqual(session.history.length, 0);
    assert.deepStrictEqual(session.state, emptyMarketplaceState());
  });

  it("translates BuyerTurnRecord to VautoAgentResponse", () => {
    const record = {
      userTurn: "Ieškau Toyota",
      decision: { text: "Radau keletą Toyota skelbimų kataloge." },
      stateBefore: emptyMarketplaceState(),
      stateAfter: {
        ...emptyMarketplaceState(),
        hardConstraints: { category: "vehicles" },
      },
      capabilityCalls: [
        { name: "searchListings", ok: true, data: { count: 5, listings: [] } },
      ],
      assistantText: "Radau keletą Toyota skelbimų kataloge.",
      resultContext: { listings: [] },
    };

    const response = buyerTurnRecordToVautoResponse(record, {});

    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.reply, "Radau keletą Toyota skelbimų kataloge.");
    assert.strictEqual(response.actions.type, "search");
    assert.strictEqual(response.toolCalls.length, 1);
    assert.strictEqual(response.toolCalls[0].name, "searchListings");
    assert.strictEqual(response.subject, "Radau keletą Toyota skelbimų kataloge.");
    assert.ok(response.coreV2State); // Core v2 state should be attached
  });

  it("uses a model clarification as the visible response", () => {
    const response = buyerTurnRecordToVautoResponse({
      userTurn: "Padėkite pasirinkti",
      decision: { clarification: "Koks jūsų biudžetas?" },
      stateBefore: emptyMarketplaceState(),
      stateAfter: emptyMarketplaceState(),
      capabilityCalls: [],
      assistantText: "",
      resultContext: { listings: [] },
    }, {});

    assert.equal(response.reply, "Koks jūsų biudžetas?");
  });

  it("rejects a Core v2 record with no visible response", () => {
    assert.throws(() => buyerTurnRecordToVautoResponse({
      userTurn: "Padėkite pasirinkti",
      decision: {},
      stateBefore: emptyMarketplaceState(),
      stateAfter: emptyMarketplaceState(),
      capabilityCalls: [],
      assistantText: "",
      resultContext: { listings: [] },
    }, {}), /core_v2_empty_visible_response/);
  });

  it("surfaces unsupported consequential capabilities as error text", () => {
    const record = {
      userTurn: "Parduodu",
      decision: { text: "Reikia patvirtinimo." },
      stateBefore: emptyMarketplaceState(),
      stateAfter: emptyMarketplaceState(),
      capabilityCalls: [
        { name: "publishListing", ok: false, error: "confirmation_required" },
      ],
      assistantText: "Reikia patvirtinimo.",
      resultContext: { listings: [] },
    };

    const response = buyerTurnRecordToVautoResponse(record, {});

    assert.strictEqual(response.ok, true);
    assert.ok(response.reply.includes("publishListing reikalauja patvirtinimo"));
    assert.strictEqual(response.actions.type, "none");
  });

  it("maps prepareListingDraft to listing_draft action type", () => {
    const record = {
      userTurn: "Parduodu butą",
      decision: { text: "Sukūriau nuotraukų juostą." },
      stateBefore: emptyMarketplaceState(),
      stateAfter: emptyMarketplaceState(),
      capabilityCalls: [
        { name: "prepareListingDraft", ok: true, data: {} },
      ],
      assistantText: "Sukūriau nuotraukų juostą.",
      resultContext: { listings: [] },
    };

    const response = buyerTurnRecordToVautoResponse(record, {});

    assert.strictEqual(response.actions.type, "listing_draft");
  });

  describe("Photo context fallback & analyzePhoto regression coverage", () => {
    it("1. pendingImageUrls=[] + non-empty sessionImageUrls -> selects sessionImageUrls as fallback", () => {
      const images = extractImageUrlsFromContext({
        pendingImageUrls: [],
        sessionImageUrls: ["https://example.com/session-photo.jpg"],
      });
      assert.deepStrictEqual(images, ["https://example.com/session-photo.jpg"]);
    });

    it("2. non-empty pendingImageUrls remains primary", () => {
      const images = extractImageUrlsFromContext({
        pendingImageUrls: ["https://example.com/primary-photo.jpg"],
        sessionImageUrls: ["https://example.com/session-photo.jpg"],
      });
      assert.deepStrictEqual(images, ["https://example.com/primary-photo.jpg"]);
    });

    it("3. both empty -> returns [] and analyzePhoto returns truthful not_found", async () => {
      const images = extractImageUrlsFromContext({
        pendingImageUrls: [],
        sessionImageUrls: [],
      });
      assert.deepStrictEqual(images, []);

      const result = await analyzePhotoCapability.execute({}, { pendingImageUrls: images });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.failureKind, "not_found");
      assert.strictEqual(result.error, "Nėra įkeltų nuotraukų analizei");
    });

    it("4. no forced analyzePhoto selection", async () => {
      // Image context extraction alone does not force analyzePhoto execution
      const images = extractImageUrlsFromContext({
        sessionImageUrls: ["https://example.com/photo.jpg"],
      });
      assert.strictEqual(images.length, 1);
      // Verify analyzePhoto is a standard registered capability with operation READ, not forced
      assert.strictEqual(analyzePhotoCapability.name, "analyzePhoto");
      assert.strictEqual(analyzePhotoCapability.operation, "READ");
    });
  });
});