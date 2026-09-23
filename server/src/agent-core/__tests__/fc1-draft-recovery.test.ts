/**
 * FC-1 — canonical draft recovery + guest persistence boundary.
 *
 * Proves through the REAL thread-service (in-memory store, stubbed agent):
 *   - an authenticated sell turn persists the canonical listing draft;
 *   - a guest sell turn does NOT persist a canonical draft (authority gate);
 *   - authenticated discovery recovers the user's OWN draft threads;
 *   - cross-user isolation (A never discovers B);
 *   - multiple separate drafts are listed, never silently merged.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  runThreadTurn,
  setThreadAgentForTests,
  discoverActiveDraftThreads,
} from "../thread-service.js";
import { InMemoryThreadStore } from "../thread-store.js";
import { setThreadStoreForTests } from "../thread-store-instance.js";
import type {
  VautoAgentRequest,
  VautoAgentResponse,
} from "../agent-types.js";

function listingAgent(draft: Record<string, unknown>) {
  return async (_req: VautoAgentRequest): Promise<VautoAgentResponse> => ({
    ok: true,
    reply: "Paruošiau juodraštį.",
    quickReplies: [],
    toolCalls: [],
    actions: {
      type: "listing_draft",
      listingDraft: draft,
    } as VautoAgentResponse["actions"],
  });
}

let store: InMemoryThreadStore;

beforeEach(() => {
  store = new InMemoryThreadStore();
  setThreadStoreForTests(store);
});

afterEach(() => {
  setThreadStoreForTests(null);
  setThreadAgentForTests(null);
});

const DRAFT = {
  title: "Medinis stalas",
  category: "home",
  price: 150,
  listingFlowState: "DRAFT_READY",
};

describe("FC-1 — guest canonical-draft boundary", () => {
  it("authenticated sell persists the canonical draft", async () => {
    setThreadAgentForTests(listingAgent(DRAFT));
    const res = await runThreadTurn({
      clientMessages: [{ role: "user", text: "Parduodu medinį stalą už 150" }],
      authUserId: "user-1",
    });
    const rec = await store.get(res.thread.threadId);
    assert.equal(rec?.listingDraft?.title, "Medinis stalas");
    assert.equal(rec?.ownerUserId, "user-1");
  });

  it("guest sell does NOT persist a canonical draft", async () => {
    setThreadAgentForTests(listingAgent(DRAFT));
    const res = await runThreadTurn({
      clientMessages: [{ role: "user", text: "Parduodu medinį stalą už 150" }],
      authUserId: null,
    });
    assert.ok(res.thread.anonSessionToken, "guest gets an anon session token");
    const rec = await store.get(res.thread.threadId);
    assert.equal(rec?.listingDraft, null, "guest draft must not be persisted");
    assert.equal(rec?.ownerUserId, null);
  });

  it("guest conversation stays natural (reply still present, draft absent)", async () => {
    setThreadAgentForTests(listingAgent(DRAFT));
    const res = await runThreadTurn({
      clientMessages: [{ role: "user", text: "Parduodu medinį stalą už 150" }],
      authUserId: null,
    });
    assert.ok(res.response.reply.length > 0, "reply preserved");
    const rec = await store.get(res.thread.threadId);
    assert.equal(rec?.listingDraft, null);
  });
});

describe("FC-1 — authenticated draft discovery", () => {
  it("recovers the user's own active draft without a client pointer", async () => {
    setThreadAgentForTests(listingAgent(DRAFT));
    const res = await runThreadTurn({
      clientMessages: [{ role: "user", text: "Parduodu medinį stalą" }],
      authUserId: "user-1",
    });
    const drafts = await discoverActiveDraftThreads("user-1");
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]!.threadId, res.thread.threadId);
    assert.equal(drafts[0]!.draft?.title, "Medinis stalas");
  });

  it("user A cannot discover user B's draft", async () => {
    setThreadAgentForTests(listingAgent(DRAFT));
    await runThreadTurn({
      clientMessages: [{ role: "user", text: "Parduodu stalą" }],
      authUserId: "user-A",
    });
    const drafts = await discoverActiveDraftThreads("user-B");
    assert.equal(drafts.length, 0, "cross-user isolation enforced");
  });

  it("multiple separate drafts are listed, never merged", async () => {
    setThreadAgentForTests(listingAgent(DRAFT));
    await runThreadTurn({
      clientMessages: [{ role: "user", text: "Parduodu stalą" }],
      authUserId: "user-1",
    });
    await runThreadTurn({
      clientMessages: [{ role: "user", text: "Parduodu kitą stalą" }],
      authUserId: "user-1",
    });
    const drafts = await discoverActiveDraftThreads("user-1");
    assert.equal(drafts.length, 2, "two separate drafts preserved, not merged");
  });
});
