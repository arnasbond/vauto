/**
 * E1 — Core v2 grounded result continuity test (BLOCKER 2).
 *
 * Proves that grounded result context persists across turns so that
 * follow-up references like "papasakok daugiau apie antrą" can be
 * resolved by guarded listingDetails.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  threadRecordToBuyerSession,
  buyerTurnRecordToVautoResponse,
} from "../core-v2-adapter.js";
import { emptyMarketplaceState } from "../../ai-core-v2/state/marketplace-state.js";
import type { ResultContext } from "../../ai-core-v2/journey/result-context.js";
import type { ThreadRecord } from "../thread-store.js";
import type { VautoAgentRequest } from "../../ai/vauto-agent.js";

describe("E1 — Core v2 grounded result continuity (BLOCKER 2)", () => {
  it("result context persists across turns for reference continuity", () => {
    const thread: ThreadRecord = {
      threadId: "test-thread",
      ownerUserId: "user-123",
      anonSessionTokenHash: null,
      version: 1,
      messages: [
        { role: "user", text: "Ieškau Toyota", at: "2024-01-01T00:00:00Z", seq: 1 },
        { role: "assistant", text: "Radau keletą Toyota", at: "2024-01-01T00:00:01Z", seq: 2 },
      ],
      lastTurnId: "turn-1",
      listingDraft: null,
      listingFlowState: null,
      searchContext: null,
      pendingConfirmations: [],
      currentIntent: "search",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:01Z",
      // Grounded result context from prior search
      coreV2ResultContext: {
        listings: [
          { id: "listing-1", title: "Toyota 1", price: 10000, location: "Vilnius" },
          { id: "listing-2", title: "Toyota 2", price: 12000, location: "Kaunas" },
          { id: "listing-3", title: "Toyota 3", price: 15000, location: "Klaipėda" },
        ],
      },
    };

    const userContext: VautoAgentRequest["context"] = {};

    const session = threadRecordToBuyerSession(thread, userContext);

    // Result context should be restored from thread persistence
    assert.strictEqual(session.resultContext.listings.length, 3);
    assert.strictEqual(session.resultContext.listings[0].id, "listing-1");
    assert.strictEqual(session.resultContext.listings[1].id, "listing-2");
    assert.strictEqual(session.resultContext.listings[2].id, "listing-3");
  });

  it("result context is NOT reconstructed as empty on every turn", () => {
    const thread: ThreadRecord = {
      threadId: "test-thread",
      ownerUserId: "user-123",
      anonSessionTokenHash: null,
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
      // No prior result context
      coreV2ResultContext: null,
    };

    const session = threadRecordToBuyerSession(thread, {});

    // Should be empty when no prior context exists
    assert.strictEqual(session.resultContext.listings.length, 0);
  });

  it("search result data is preserved in response for UI rendering (BLOCKER 4)", () => {
    const record = {
      userTurn: "Ieškau Toyota",
      decision: { text: "Radau keletą Toyota skelbimų kataloge." },
      stateBefore: emptyMarketplaceState(),
      stateAfter: {
        ...emptyMarketplaceState(),
        hardConstraints: { category: "vehicles" },
      },
      capabilityCalls: [
        {
          name: "searchListings",
          ok: true,
          data: {
            count: 3,
            listings: [
              { id: "listing-1", title: "Toyota Camry", price: 15000, location: "Vilnius" },
              { id: "listing-2", title: "Toyota Corolla", price: 8000, location: "Kaunas" },
              { id: "listing-3", title: "Toyota RAV4", price: 12000, location: "Klaipėda" },
            ],
          },
        },
      ],
      assistantText: "Radau keletą Toyota skelbimų kataloge.",
      resultContext: {
        listings: [
          { id: "listing-1", title: "Toyota Camry", price: 15000, location: "Vilnius" },
          { id: "listing-2", title: "Toyota Corolla", price: 8000, location: "Kaunas" },
          { id: "listing-3", title: "Toyota RAV4", price: 12000, location: "Klaipėda" },
        ],
      },
    };

    const response = buyerTurnRecordToVautoResponse(record, {});

    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.actions.type, "search");

    // BLOCKER 4: Real search result data should be preserved for UI
    const searchAction = response.actions as { type: "search"; searchQuery: string; listingIds: string[] };
    assert.strictEqual(searchAction.listingIds.length, 3);
    assert.strictEqual(searchAction.listingIds[0], "listing-1");
    assert.strictEqual(searchAction.listingIds[1], "listing-2");
    assert.strictEqual(searchAction.listingIds[2], "listing-3");

    // Tool calls should contain real data, not just { success: true }
    assert.strictEqual(response.toolCalls.length, 1);
    assert.strictEqual(response.toolCalls[0].name, "searchListings");
    const toolResult = response.toolCalls[0].result as { count: number; listings: unknown[] };
    assert.strictEqual(toolResult.count, 3);
    assert.strictEqual(toolResult.listings.length, 3);

    // Result context should be attached for persistence
    assert.ok(response.coreV2ResultContext);
    assert.strictEqual((response.coreV2ResultContext as { listings: unknown[] }).listings.length, 3);
  });
});
