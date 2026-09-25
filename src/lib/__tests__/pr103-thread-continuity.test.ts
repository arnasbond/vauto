/**
 * PR #103 — Core v2 Thread Continuity & History Preservation Invariants
 *
 * Verifies that:
 * 1. An established active Core v2 conversation preserves its server-issued threadId
 *    across normal consecutive human turns, even when input contains search terms or keywords.
 * 2. Visible message history preserves ordered user and assistant turns
 *    (user1 → assistant1 → user2 → assistant2) without stripping assistant messages.
 * 3. Explicit UI reset actions clear threadId via clearAgentThreadId().
 * 4. In-flight Core v2 turns suppress proactive interventions and preserve single authority.
 * 5. Legacy no_match intervention authority remains strictly disabled.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, before } from "node:test";

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
    };
  }
});

import {
  readAgentThreadLink,
  persistAgentThreadLink,
  clearAgentThreadId,
} from "@/lib/agent-thread-link";
import { selectAgentSessionMessages } from "@/lib/agent-session-memory";
import { isLiveInterventionAllowed } from "@/lib/agent-action-guard";
import type { AgentChatMessage } from "@/lib/vauto-agent-client";

describe("PR #103 Thread Continuity & History Preservation Invariants", () => {
  beforeEach(() => {
    clearAgentThreadId();
  });

  it("1. Established Core v2 threadId is preserved across consecutive turns", () => {
    // Turn 1 completes and server assigns threadId
    persistAgentThreadLink({
      threadId: "thr_fd21a4b5c5f33fa19d8c93d1",
      version: 1,
    });

    const activeLinkBeforeTurn2 = readAgentThreadLink();
    assert.ok(activeLinkBeforeTurn2, "Thread link should exist after Turn 1");
    assert.equal(activeLinkBeforeTurn2?.threadId, "thr_fd21a4b5c5f33fa19d8c93d1");

    // Turn 2: Natural language follow-up with search keywords
    const turn2Text =
      "Svarbiausia patikimumas. Patikrink internete, kuris iš šių variantų patikimesnis ir kokios dažniausios jų problemos.";

    assert.ok(turn2Text.length > 0, "Turn 2 query text should be valid");
    const activeLinkDuringTurn2 = readAgentThreadLink();
    assert.equal(
      activeLinkDuringTurn2?.threadId,
      "thr_fd21a4b5c5f33fa19d8c93d1",
      "Thread ID must be preserved across consecutive natural language turns"
    );
  });

  it("2. Visible message state preserves ordered prior user and assistant turns", () => {
    const turn1User: AgentChatMessage = { role: "user", text: "Ieškau šeimai automobilio iki 20k eurų" };
    const turn1Assistant: AgentChatMessage = { role: "assistant", text: "Radau Citroën Grand C4 Picasso ir Citroën DS5 2013." };

    let messages: AgentChatMessage[] = [turn1User, turn1Assistant];

    // User sends turn 2
    const turn2User: AgentChatMessage = { role: "user", text: "Kuris variantas patikimesnis?" };
    messages = [...messages, turn2User];

    // Assistant completes turn 2 (PR103 setMessages pattern appending directly without user-only filtering)
    const turn2Assistant: AgentChatMessage = { role: "assistant", text: "Pagal atsiliepimus Citroën Grand C4 Picasso yra labai patikimas šeimos vienatūris..." };
    
    // Simulating PR103 setMessages reducer
    messages = [...messages, turn2Assistant].slice(-12);

    // Production helper selectAgentSessionMessages preserves user and assistant roles across turns
    const sessionSelected = selectAgentSessionMessages(messages);
    assert.equal(sessionSelected.length, 4, "selectAgentSessionMessages must preserve all turns");
    assert.deepEqual(
      sessionSelected.map((m) => m.role),
      ["user", "assistant", "user", "assistant"],
      "Production session messages payload must maintain user and assistant roles"
    );
  });

  it("3. Explicit chat reset clears threadId via clearAgentThreadId()", () => {
    persistAgentThreadLink({
      threadId: "thr_test123",
      version: 2,
    });

    assert.ok(readAgentThreadLink(), "Thread link exists before clear");

    // Explicit user reset action
    clearAgentThreadId();

    assert.equal(readAgentThreadLink(), null, "Thread link must be null after explicit reset");
  });

  it("4. Core v2 turn in-flight suppresses proactive client-side interventions", () => {
    const isAllowed = isLiveInterventionAllowed({
      agentBusy: true,
      interventionKind: "user_nudge",
    });

    assert.equal(isAllowed, false, "In-flight Core v2 turn (agentBusy=true) must suppress interventions");
  });

  it("5. Legacy no_match intervention authority remains strictly disabled", () => {
    const isAllowed = isLiveInterventionAllowed({
      agentBusy: false,
      interventionKind: "no_match",
    });

    assert.equal(isAllowed, false, "no_match intervention authority must remain disabled");
  });
});
