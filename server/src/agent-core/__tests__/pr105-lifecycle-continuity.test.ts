/**
 * PR #105 — Server End-to-End Thread Continuity Lifecycle Integration Test
 *
 * Verifies full end-to-end server execution for consecutive anonymous turns:
 * 1. Turn 1 executes runThreadTurn, issuing threadId & anonSessionToken.
 * 2. Simulation of search capability / URL filter update.
 * 3. Turn 2 executes runThreadTurn presenting SAME threadId & anonSessionToken.
 * 4. Server accepts continuation without thread ownership violation.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  runThreadTurn,
  setThreadAgentForTests,
} from "../thread-service.js";
import { InMemoryThreadStore } from "../thread-store.js";
import { setThreadStoreForTests } from "../thread-store-instance.js";

describe("PR #105 Server Thread Continuity Integration Test", () => {
  beforeEach(() => {
    setThreadStoreForTests(new InMemoryThreadStore());
    setThreadAgentForTests(async () => ({
      ok: true,
      reply: "Radau Citroën Grand C4 Picasso ir Citroën DS5 2013.",
      toolCalls: [],
      actions: {
        type: "search",
        filters: { category: "vehicles", priceMax: 20000 },
        listingIds: ["listing-1", "listing-2"],
      },
    }));
  });

  afterEach(() => {
    setThreadStoreForTests(null);
    setThreadAgentForTests(null);
  });

  it("Turn 1 → search capability → Turn 2 executes under SAME threadId and preserves token", async () => {
    // ── Turn 1: Client sends initial buyer turn (anonymous)
    const turn1Result = await runThreadTurn({
      clientMessages: [
        {
          role: "user",
          text: "Reikia šeimai patikimo automobilio iki 20 tūkst. eurų. Ką pasiūlytum?",
        },
      ],
    });

    const threadId1 = turn1Result.thread.threadId;
    const anonToken1 = turn1Result.thread.anonSessionToken;

    assert.ok(threadId1.startsWith("thr_"), "Turn 1 must mint server threadId");
    assert.ok(anonToken1, "Turn 1 must issue anonSessionToken");

    // ── Turn 2: Client presents previous threadId + anonSessionToken
    const turn2Result = await runThreadTurn({
      threadId: threadId1,
      anonSessionToken: anonToken1,
      clientMessages: [
        {
          role: "user",
          text: "Svarbiausia patikimumas. Patikrink internete, kuris iš šių variantų patikimesnis?",
        },
      ],
    });

    assert.equal(
      turn2Result.thread.threadId,
      threadId1,
      "Turn 2 must execute on the exact SAME threadId as Turn 1"
    );
    assert.ok(
      turn2Result.thread.version > turn1Result.thread.version,
      "Turn 2 must advance thread version"
    );
    assert.equal(
      turn2Result.thread.anonSessionToken,
      anonToken1,
      "Turn 2 response must preserve anonSessionToken"
    );
  });
});
