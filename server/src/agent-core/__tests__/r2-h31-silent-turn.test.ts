/**
 * R2-H3.1 — A USER TURN MUST NEVER END SILENTLY.
 *
 * Production incident: a valid real-estate buying/retrieval request returned
 * no visible assistant response. Regardless of the upstream cause (model
 * empty output, planner failure, tool failure), the thread boundary must
 * terminate the turn with a truthful visible fallback — never fabricate
 * success, never leave the user staring at nothing.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { InMemoryThreadStore } from "../thread-store.js";
import { setThreadStoreForTests } from "../thread-store-instance.js";
import { runThreadTurn, setThreadAgentForTests } from "../thread-service.js";
import type { VautoAgentResponse } from "../../ai/vauto-agent.js";
import { geminiSupervisorTurn } from "../../ai/supervisor-tool-runner.js";

afterEach(() => {
  setThreadStoreForTests(null);
  setThreadAgentForTests(null);
});

describe("R2-H3.1 — no silent turn", () => {
  it("empty agent reply is replaced with a visible fallback", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    setThreadAgentForTests(async () => {
      return { ok: true, reply: "", toolCalls: [], actions: { type: "none" } } as VautoAgentResponse;
    });
    const result = await runThreadTurn({
      clientMessages: [{ role: "user", text: "padek surasti busta" }],
    });
    assert.ok(String(result.response.reply ?? "").trim().length > 0, "reply must be visible");
    assert.match(result.response.reply, /padek surasti busta/, "fallback echoes the user's request");
  });

  it("whitespace/undefined reply is replaced with a visible fallback", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    setThreadAgentForTests(async () => {
      return { ok: true, reply: "   ", toolCalls: [], actions: { type: "none" } } as VautoAgentResponse;
    });
    const result = await runThreadTurn({
      clientMessages: [{ role: "user", text: "reikia busto semai kaune" }],
    });
    assert.ok(String(result.response.reply ?? "").trim().length > 0, "reply must be visible");
  });

  it("a normal non-empty reply is left untouched", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    setThreadAgentForTests(async () => {
      return { ok: true, reply: "Štai pasiūlymai", toolCalls: [], actions: { type: "none" } } as VautoAgentResponse;
    });
    const result = await runThreadTurn({
      clientMessages: [{ role: "user", text: "ieskau buto" }],
    });
    assert.equal(result.response.reply, "Štai pasiūlymai");
  });

  it("empty Gemini output is classified and surfaces as an empty (non-throwing) turn", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    try {
      const result = await geminiSupervisorTurn(
        [{ role: "user", parts: [{ text: "padek surasti busta" }] }],
        "gemini-test",
        "system"
      );
      assert.deepEqual(result.text, "", "empty output yields empty text");
      assert.deepEqual(result.parts, [], "empty output yields no parts");
    } finally {
      globalThis.fetch = original;
      delete process.env.GEMINI_API_KEY;
    }
  });
});
