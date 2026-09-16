/**
 * FC-1 — client → canonical server draft synchronization + stale protection.
 *
 * Proves the server-side round-trip: a client-proposed delta merges into the
 * user's OWN canonical draft under OCC, a stale client can never overwrite a
 * newer canonical draft, and ownership is verified server-side.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  runThreadTurn,
  setThreadAgentForTests,
  syncListingDraft,
  mergeDraftDelta,
} from "../thread-service.js";
import { InMemoryThreadStore } from "../thread-store.js";
import { setThreadStoreForTests } from "../thread-store-instance.js";
import type {
  VautoAgentRequest,
  VautoAgentResponse,
} from "../../ai/vauto-agent.js";

function listingAgent(draft: Record<string, unknown>) {
  return async (_req: VautoAgentRequest): Promise<VautoAgentResponse> => ({
    ok: true,
    reply: "Paruošiau juodraštį.",
    quickReplies: [],
    toolCalls: [],
    actions: { type: "listing_draft", listingDraft: draft } as VautoAgentResponse["actions"],
  });
}

const BASE_DRAFT = {
  title: "Medinis stalas",
  category: "home",
  price: 150,
  location: "Vilnius",
  attributes: { condition: "Naudotas" },
  listingFlowState: "DRAFT_READY",
};

beforeEach(() => {
  setThreadStoreForTests(new InMemoryThreadStore());
});

afterEach(() => {
  setThreadStoreForTests(null);
  setThreadAgentForTests(null);
});

async function createAuthDraft(userId: string) {
  setThreadAgentForTests(listingAgent(BASE_DRAFT));
  const res = await runThreadTurn({
    clientMessages: [{ role: "user", text: "Parduodu medinį stalą" }],
    authUserId: userId,
  });
  const store = new InMemoryThreadStore();
  void store;
  return res.thread;
}

describe("FC-1 — draft delta merge", () => {
  it("merges attributes (delta wins) and preserves canonical fields", () => {
    const merged = mergeDraftDelta(BASE_DRAFT, {
      attributes: { material: "ąžuolas" },
    });
    assert.equal(merged.title, "Medinis stalas", "canonical title preserved");
    const attrs = (merged.attributes ?? {}) as Record<string, string>;
    assert.equal(attrs.material, "ąžuolas", "new attribute added");
    assert.equal(attrs.condition, "Naudotas", "prior attribute preserved");
  });

  it("replaces scalar fields only when present", () => {
    const merged = mergeDraftDelta(BASE_DRAFT, { price: 450 });
    assert.equal(merged.price, 450);
    assert.equal(merged.title, "Medinis stalas");
  });

  it("drops unknown keys (never canonical authority)", () => {
    const merged = mergeDraftDelta(BASE_DRAFT, {
      hackerField: "injected",
      listingFlowState: "HACKED",
    } as unknown as Record<string, unknown>);
    assert.equal((merged as Record<string, unknown>).hackerField, undefined);
    // The DELTA's "HACKED" flow-state is ignored (not whitelisted); the
    // canonical base's flow-state is preserved, never overwritten by the client.
    assert.equal((merged as Record<string, unknown>).listingFlowState, "DRAFT_READY");
  });
});

describe("FC-1 — draft sync round-trip + stale protection", () => {
  it("sync merges a delta into the canonical draft (enrichment round-trip)", async () => {
    const thread = await createAuthDraft("user-1");
    const result = await syncListingDraft({
      userId: "user-1",
      threadId: thread.threadId,
      expectedVersion: thread.version,
      delta: { attributes: { material: "ąžuolas" } },
    });
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.draft?.title, "Medinis stalas");
      assert.equal(
        (result.draft?.attributes as Record<string, string>)?.material,
        "ąžuolas"
      );
    }
  });

  it("stale client (old version) cannot overwrite newer canonical draft", async () => {
    const thread = await createAuthDraft("user-1");
    // V1 -> V2 via a first sync.
    const first = await syncListingDraft({
      userId: "user-1",
      threadId: thread.threadId,
      expectedVersion: thread.version,
      delta: { price: 200 },
    });
    assert.ok(first.ok);
    const v2Version = (first as { version: number }).version;

    // Stale browser still holds V1 (expectedVersion = thread.version) and
    // submits an enrichment — it must be rejected and V2 preserved.
    const stale = await syncListingDraft({
      userId: "user-1",
      threadId: thread.threadId,
      expectedVersion: thread.version,
      delta: { price: 1 },
    });
    assert.equal(stale.ok, false);
    assert.equal((stale as { reason: string }).reason, "stale_version");

    // Canonical V2 price is preserved (not the stale V1 overwrite).
    const after = await syncListingDraft({
      userId: "user-1",
      threadId: thread.threadId,
      expectedVersion: v2Version,
      delta: { attributes: { color: "rudas" } },
    });
    assert.ok(after.ok);
    assert.equal((after.draft as Record<string, unknown> | null)?.price, 200);
  });

  it("user A cannot sync user B's draft (ownership isolation)", async () => {
    const thread = await createAuthDraft("user-A");
    const result = await syncListingDraft({
      userId: "user-B",
      threadId: thread.threadId,
      expectedVersion: thread.version,
      delta: { price: 1 },
    });
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "ownership_violation");
  });

  it("sync is truthful: success returns updated draft; unknown thread is not_found", async () => {
    const result = await syncListingDraft({
      userId: "user-1",
      threadId: "thr_does_not_exist",
      delta: { price: 1 },
    });
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "not_found");
  });
});
