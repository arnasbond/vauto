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

  it("malformed persisted provenance does NOT restore execution-authoritative state", () => {
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
      // Persisted state with MALFORMED provenance — arbitrary source string
      coreV2State: {
        version: "2.1",
        hardConstraints: { location: "Vilnius", category: "vehicles" },
        hardConstraintProvenance: {
          location: { source: "INJECTED_FAKE_SOURCE", at: "2024-01-01T00:00:00Z" },
          // category has no provenance at all — orphan constraint
        },
      },
    };

    const session = threadRecordToBuyerSession(thread, {});

    // Constraint with invalid provenance source must be dropped
    assert.strictEqual(session.state.hardConstraints.location, undefined,
      "Constraint with invalid provenance source must be dropped");
    assert.strictEqual(session.state.hardConstraintProvenance.location, undefined,
      "Invalid provenance entry must be dropped");

    // Constraint without any provenance must be dropped (no orphan authority)
    assert.strictEqual(session.state.hardConstraints.category, undefined,
      "Constraint without provenance must be dropped");
  });

  it("valid USER_STATED persisted state survives reload with provenance intact", () => {
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
      // Properly formed Core v2 state with valid provenance
      coreV2State: {
        version: "2.1",
        hardConstraints: { location: "Kaunas", category: "vehicles", priceMax: 20000 },
        hardConstraintProvenance: {
          location: { source: "USER_STATED", at: "2024-01-01T00:00:00Z" },
          category: { source: "MODEL_INFERRED", at: "2024-01-01T00:00:01Z" },
          priceMax: { source: "USER_STATED", at: "2024-01-01T00:00:02Z" },
        },
        softPreferences: [
          { label: "šeimos automobilis", provenance: { source: "USER_STATED", at: "2024-01-01T00:00:00Z" } },
        ],
        pendingAction: { type: "mark_sold", description: "Pažymėti kaip parduotą" },
      },
    };

    const session = threadRecordToBuyerSession(thread, {});

    // Valid USER_STATED constraints must survive
    assert.strictEqual(session.state.hardConstraints.location, "Kaunas");
    assert.strictEqual(session.state.hardConstraintProvenance.location?.source, "USER_STATED");
    assert.strictEqual(session.state.hardConstraintProvenance.location?.at, "2024-01-01T00:00:00Z");

    // Valid MODEL_INFERRED constraints must also survive
    assert.strictEqual(session.state.hardConstraints.category, "vehicles");
    assert.strictEqual(session.state.hardConstraintProvenance.category?.source, "MODEL_INFERRED");

    // Valid numeric constraint with provenance
    assert.strictEqual(session.state.hardConstraints.priceMax, 20000);
    assert.strictEqual(session.state.hardConstraintProvenance.priceMax?.source, "USER_STATED");

    // Valid soft preferences with provenance
    assert.strictEqual(session.state.softPreferences.length, 1);
    assert.strictEqual(session.state.softPreferences[0].label, "šeimos automobilis");
    assert.strictEqual(session.state.softPreferences[0].provenance.source, "USER_STATED");

    // Valid pendingAction
    assert.ok(session.state.pendingAction);
    assert.strictEqual(session.state.pendingAction!.type, "mark_sold");
    assert.strictEqual(session.state.pendingAction!.description, "Pažymėti kaip parduotą");
  });

  it("malformed pendingAction is dropped (fail-closed)", () => {
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
      coreV2State: {
        version: "2.1",
        hardConstraints: {},
        hardConstraintProvenance: {},
        // Missing required 'description' field
        pendingAction: { type: "delete_account" },
      },
    };

    const session = threadRecordToBuyerSession(thread, {});

    // Malformed pendingAction must be dropped
    assert.strictEqual(session.state.pendingAction, undefined,
      "pendingAction with missing description must be dropped");
  });
});
