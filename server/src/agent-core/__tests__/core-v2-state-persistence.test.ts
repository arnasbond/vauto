/**
 * E1 — Core v2 state persistence contract test (BLOCKER 3).
 *
 * Proves that Core v2 state and result context persist in the thread store
 * and survive thread reload with provenance intact. Uses InMemoryThreadStore
 * to validate the contract without requiring Postgres DB access.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { InMemoryThreadStore } from "../thread-store.js";
import type { ThreadRecord } from "../thread-store.js";

describe("E1 — Core v2 state persistence contract (BLOCKER 3)", () => {
  it("Core v2 state persists and survives thread reload", async () => {
    const store = new InMemoryThreadStore();

    const record: ThreadRecord = {
      threadId: "test-core-v2-state-" + Date.now(),
      ownerUserId: "test-user",
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
      // Core v2 state with provenance
      coreV2State: {
        version: "2.1",
        goal: "find_vehicle",
        vertical: "vehicles",
        hardConstraints: { category: "vehicles", location: "Vilnius" },
        hardConstraintProvenance: {
          category: { source: "USER_STATED", at: "2024-01-01T00:00:00Z" },
          location: { source: "USER_STATED", at: "2024-01-01T00:00:00Z" },
        },
        softPreferences: [],
        exclusions: [],
        unresolved: [],
        selectedListingIds: [],
      },
      // Grounded result context
      coreV2ResultContext: {
        listings: [
          { id: "listing-1", title: "Toyota 1", price: 10000, location: "Vilnius" },
          { id: "listing-2", title: "Toyota 2", price: 12000, location: "Kaunas" },
          { id: "listing-3", title: "Toyota 3", price: 15000, location: "Klaipėda" },
        ],
      },
    };

    // Persist the thread
    await store.create(record);

    // Reload the thread from store
    const reloaded = await store.get(record.threadId);

    assert.ok(reloaded, "Thread should be reloadable from store");
    assert.strictEqual(reloaded!.threadId, record.threadId);
    assert.strictEqual(reloaded!.version, 1);

    // Core v2 state should persist with provenance intact
    assert.ok(reloaded!.coreV2State, "Core v2 state should persist");
    const state = reloaded!.coreV2State as Record<string, unknown>;
    assert.strictEqual(state.version, "2.1");
    assert.strictEqual(state.goal, "find_vehicle");
    const hardConstraints = state.hardConstraints as Record<string, unknown>;
    assert.strictEqual(hardConstraints.category, "vehicles");
    assert.strictEqual(hardConstraints.location, "Vilnius");
    const provenance = state.hardConstraintProvenance as Record<string, unknown>;
    const locationProv = provenance.location as { source: string; at: string };
    assert.strictEqual(locationProv.source, "USER_STATED", "Provenance should persist");

    // Result context should persist
    assert.ok(reloaded!.coreV2ResultContext, "Result context should persist");
    const resultCtx = reloaded!.coreV2ResultContext as Record<string, unknown>;
    const listings = resultCtx.listings as Array<{ id: string }>;
    assert.strictEqual(listings.length, 3);
    assert.strictEqual(listings[0].id, "listing-1");
  });

  it("Core v2 state survives thread update", async () => {
    const store = new InMemoryThreadStore();

    const record: ThreadRecord = {
      threadId: "test-core-v2-update-" + Date.now(),
      ownerUserId: "test-user",
      anonSessionTokenHash: null,
      version: 1,
      messages: [{ role: "user", text: "Sveiki", at: "2024-01-01T00:00:00Z", seq: 1 }],
      lastTurnId: "turn-1",
      listingDraft: null,
      listingFlowState: null,
      searchContext: null,
      pendingConfirmations: [],
      currentIntent: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      coreV2State: {
        version: "2.1",
        hardConstraints: { category: "vehicles" },
        hardConstraintProvenance: { category: { source: "USER_STATED", at: "2024-01-01T00:00:00Z" } },
        softPreferences: [],
        exclusions: [],
        unresolved: [],
        selectedListingIds: [],
      },
    };

    await store.create(record);

    // Update the thread with new Core v2 state
    const result = await store.update(record.threadId, (current) => ({
      ...current,
      coreV2State: {
        ...current.coreV2State!,
        hardConstraints: { category: "vehicles", location: "Kaunas" },
        hardConstraintProvenance: {
          category: { source: "USER_STATED", at: "2024-01-01T00:00:00Z" },
          location: { source: "USER_STATED", at: "2024-01-01T00:01:00Z" },
        },
      },
    }));

    assert.strictEqual(result.ok, true, "Update should succeed");
    assert.strictEqual(result.record?.version, 2);

    // Reload and verify updated state
    const reloaded = await store.get(record.threadId);
    assert.ok(reloaded);
    const state = reloaded!.coreV2State as Record<string, unknown>;
    const hardConstraints = state.hardConstraints as Record<string, unknown>;
    assert.strictEqual(hardConstraints.location, "Kaunas");
    const provenance = state.hardConstraintProvenance as Record<string, unknown>;
    const locationProv = provenance.location as { source: string; at: string };
    assert.strictEqual(locationProv.source, "USER_STATED");
  });
});
