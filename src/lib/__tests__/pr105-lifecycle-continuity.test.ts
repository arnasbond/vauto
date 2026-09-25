/**
 * PR #105 — End-to-End Client/Server Thread Continuity Lifecycle Test
 *
 * Verifies the full client/server continuation lifecycle for anonymous buyer turns:
 * 1. Anonymous Turn 1 executes searchListings capability.
 * 2. Server returns thread metadata { threadId, version: 1, anonSessionToken }.
 * 3. Client persists thread link and handles search result / URL filter update.
 * 4. Normal Turn 2 request construction reads back the saved thread link.
 * 5. Server runThreadTurn receives Turn 2 with SAME threadId and valid anon token,
 *    persisting turn 2 under the same threadId without thread ownership violation.
 */
import assert from "node:assert/strict";
import { describe, it, before, beforeEach, afterEach } from "node:test";

// Mock minimal window & localStorage for Node environment test
before(() => {
  if (typeof globalThis.window === "undefined") {
    const store: Record<string, string> = {};
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, val: string) => {
          store[key] = val;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      },
      location: {
        search: "",
        pathname: "/",
        hash: "",
      },
    };
  }
});

import {
  readAgentThreadLink,
  persistAgentThreadLink,
  clearAgentThreadId,
} from "@/lib/agent-thread-link";
import {
  runThreadTurn,
  setThreadAgentForTests,
} from "../../../server/src/agent-core/thread-service.js";
import {
  InMemoryThreadStore,
} from "../../../server/src/agent-core/thread-store.js";
import { setThreadStoreForTests } from "../../../server/src/agent-core/thread-store-instance.js";

describe("PR #105 Lifecycle Thread Continuity Test", () => {
  beforeEach(() => {
    clearAgentThreadId();
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
    clearAgentThreadId();
  });

  it("Anonymous Turn 1 → search capability → URL update → Turn 2 retains SAME threadId and anonSessionToken", async () => {
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

    // Client receives Turn 1 stream final response and persists thread link
    persistAgentThreadLink({
      threadId: threadId1,
      version: turn1Result.thread.version,
      anonSessionToken: anonToken1,
    });

    // ── Search result capability handling: updates URL search parameters
    if (typeof globalThis.window !== "undefined") {
      (globalThis.window as unknown as { location: { search: string } }).location.search =
        "?category=vehicles&priceMax=20000";
    }

    // Client verifies persisted thread link state after search actions apply
    const activeLinkAfterTurn1 = readAgentThreadLink();
    assert.ok(activeLinkAfterTurn1, "Active thread link must exist after Turn 1");
    assert.equal(activeLinkAfterTurn1?.threadId, threadId1, "Thread ID must match Turn 1");
    assert.equal(
      activeLinkAfterTurn1?.anonSessionToken,
      anonToken1,
      "anonSessionToken must survive Turn 1 capability/URL update"
    );

    // ── Turn 2: Client constructs request body reading back active link
    const refreshedLinkForTurn2 = readAgentThreadLink();
    assert.ok(refreshedLinkForTurn2?.threadId, "Turn 2 must attach existing threadId");

    // Client sends Turn 2 to server runThreadTurn
    const turn2Result = await runThreadTurn({
      threadId: refreshedLinkForTurn2.threadId,
      anonSessionToken: refreshedLinkForTurn2.anonSessionToken,
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

    // Client receives Turn 2 final result and persists thread link
    persistAgentThreadLink({
      threadId: turn2Result.thread.threadId,
      version: turn2Result.thread.version,
      ...(turn2Result.thread.anonSessionToken
        ? { anonSessionToken: turn2Result.thread.anonSessionToken }
        : {}),
    });

    const activeLinkAfterTurn2 = readAgentThreadLink();
    assert.equal(
      activeLinkAfterTurn2?.threadId,
      threadId1,
      "Thread link in storage must preserve threadId after Turn 2"
    );
    assert.equal(
      activeLinkAfterTurn2?.anonSessionToken,
      anonToken1,
      "Thread link in storage must preserve anonSessionToken after Turn 2"
    );
  });
});
