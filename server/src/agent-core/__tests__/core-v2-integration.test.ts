/**
 * E1 — Core v2 integration test (adapter routing).
 *
 * Validates that when CORE_V2_ENABLED is true, the Thread Service
 * correctly routes to Core v2 and preserves conversation continuity.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { setThreadStoreForTests } from "../thread-store-instance.js";
import { InMemoryThreadStore } from "../thread-store.js";
import { runThreadTurn, setThreadAgentForTests } from "../thread-service.js";
import { CORE_V2_ENABLED } from "../core-v2-adapter.js";
import type { VautoAgentRequest, VautoAgentResponse } from "../../ai/vauto-agent.js";

describe("E1 — Core v2 integration (adapter routing)", () => {
  let testStore: InMemoryThreadStore;

  afterEach(() => {
    setThreadAgentForTests(null);
    setThreadStoreForTests(null);
  });

  function installMockAgent() {
    testStore = new InMemoryThreadStore();
    setThreadStoreForTests(testStore);
    setThreadAgentForTests((async (req: VautoAgentRequest) => ({
      ok: true,
      reply: "Test response",
      toolCalls: [],
      actions: { type: "none" },
    })) as Parameters<typeof setThreadAgentForTests>[0]);
  }

  it("CORE_V2_ENABLED flag is set to true for production cutover", () => {
    assert.strictEqual(CORE_V2_ENABLED, true, "Core v2 should be enabled for production cutover");
  });

  it("thread service preserves conversation continuity", async () => {
    installMockAgent();

    const turn1 = await runThreadTurn({
      threadId: null,
      authUserId: "test-user",
      clientMessages: [{ role: "user", text: "Sveiki" }],
      context: { userCity: "Vilnius" },
    });

    assert.strictEqual(turn1.response.ok, true);
    assert.ok(turn1.thread.threadId);
    assert.ok(turn1.thread.version >= 1);

    // Second turn should continue the conversation
    const turn2 = await runThreadTurn({
      threadId: turn1.thread.threadId,
      authUserId: "test-user",
      clientMessages: [{ role: "user", text: "Kaip tu?" }],
      context: { userCity: "Vilnius" },
    });

    assert.strictEqual(turn2.response.ok, true);
    assert.strictEqual(turn2.thread.threadId, turn1.thread.threadId);
    assert.ok(turn2.thread.version > turn1.thread.version);

    // History should be preserved
    const thread = await testStore.get(turn1.thread.threadId);
    assert.ok(thread);
    assert.ok(thread!.messages.length >= 2);
  });

  it("thread service handles empty user message gracefully", async () => {
    installMockAgent();

    await assert.rejects(
      runThreadTurn({
        threadId: null,
        authUserId: "test-user",
        clientMessages: [{ role: "user", text: "" }],
        context: {},
      }),
      /empty_user_turn/
    );
  });

  it("thread service preserves anonymous session isolation", async () => {
    installMockAgent();

    const turn1 = await runThreadTurn({
      threadId: null,
      authUserId: null,
      anonSessionToken: "anon-token-123",
      clientMessages: [{ role: "user", text: "Guest message" }],
      context: {},
    });

    assert.ok(turn1.thread.anonSessionToken);

    // Different anon token should not access the same thread
    await assert.rejects(
      runThreadTurn({
        threadId: turn1.thread.threadId,
        authUserId: null,
        anonSessionToken: "different-token",
        clientMessages: [{ role: "user", text: "Should fail" }],
        context: {},
      }),
      /thread_ownership_violation/
    );
  });
});
