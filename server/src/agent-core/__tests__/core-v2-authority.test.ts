/**
 * E1 — Core v2 authority regression tests.
 *
 * BLOCKER 1: userCity must NOT become USER_STATED authority.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  threadRecordToBuyerSession,
} from "../core-v2-adapter.js";
import { emptyMarketplaceState } from "../../ai-core-v2/state/marketplace-state.js";
import type { ThreadRecord } from "../thread-store.js";
import type { VautoAgentRequest } from "../../ai/vauto-agent.js";

describe("E1 — Core v2 authority (BLOCKER 1)", () => {
  it("profile city does NOT become USER_STATED authority", () => {
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
    };

    const userContext: VautoAgentRequest["context"] = {
      userCity: "Vilnius",
    };

    const session = threadRecordToBuyerSession(thread, userContext);

    // userCity should NOT be promoted to USER_STATED authority
    assert.strictEqual(session.state.hardConstraints.location, undefined);
    assert.strictEqual(session.state.hardConstraintProvenance.location, undefined);

    // State should remain empty (no profile authority promotion)
    assert.deepStrictEqual(session.state, emptyMarketplaceState());
  });

  it("only semantically verified user intent may become USER_STATED", () => {
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
      // Core v2 state with USER_STATED location from semantic verification
      coreV2State: {
        version: "2.1",
        hardConstraints: { location: "Kaunas" },
        hardConstraintProvenance: {
          location: { source: "USER_STATED", at: "2024-01-01T00:00:00Z" },
        },
      },
    };

    const userContext: VautoAgentRequest["context"] = {
      userCity: "Vilnius", // Different from Core v2 state
    };

    const session = threadRecordToBuyerSession(thread, userContext);

    // Core v2 state should be preserved (semantic verification)
    assert.strictEqual(session.state.hardConstraints.location, "Kaunas");
    assert.strictEqual(session.state.hardConstraintProvenance.location?.source, "USER_STATED");

    // Profile city should NOT override verified intent
    assert.notStrictEqual(session.state.hardConstraints.location, "Vilnius");
  });
});
