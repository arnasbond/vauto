/**
 * E2.4 — LIVE measurement regression tests.
 *
 * Proves, against the REAL /api/vauto-agent/stream route:
 *  1. the final-event wire contract is `{type:"final", result:{...}}` and
 *     the parser unpacks reply/toolCalls/actions/thread from `.result`;
 *  2. an SSE `error` event surfaces as an explicit infrastructure ERROR —
 *     never as `reply=""` or a behavioral FAIL.
 *
 * The agent is driven deterministically (scripted model + deterministic
 * reference planner), exactly like the golden harness — the tests verify
 * the MEASUREMENT layer only. No Agent Core / planner / policy / routing
 * behavior is asserted to change.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import request from "supertest";

import { InMemoryThreadStore } from "../../agent-core/thread-store.js";
import { setThreadStoreForTests } from "../../agent-core/thread-store-instance.js";
import { optionalAuth } from "../../middleware/auth.js";
import { vautoAgentRouter } from "../../routes/vauto-agent.js";
import { planTurn } from "../../ai/planner/planner-engine.js";
import { setPlannerDecisionProviderForTests } from "../../ai/planner/planner-orchestrator.js";
import {
  createScriptedModelProvider,
  round,
  text,
} from "../harness/scripted-model-provider.js";
import { parseLiveStreamBody } from "../harness/live-stream-parser.js";

function createApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api/vauto-agent", vautoAgentRouter);
  return app;
}

afterEach(() => {
  setThreadStoreForTests(null);
  setPlannerDecisionProviderForTests(null);
  delete process.env.GEMINI_API_KEY;
});

describe("E2.4 — LIVE SSE wire parsing (real /stream route)", () => {
  it("the real final event carries the payload under `.result` and the parser unpacks it", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    setPlannerDecisionProviderForTests(async (input) => planTurn(input));
    const recorder = createScriptedModelProvider({
      turns: [[round(text("Radau 1 variantą pagal „Volvo“ — peržiūrėk ekrane."))]],
      exhausted: { parts: [] },
    });
    const prevFetch = recorder.install();
    process.env.GEMINI_API_KEY = "e24-test-key";
    const app = createApp();
    try {
      const res = await request(app).post("/api/vauto-agent/stream").send({
        turnId: "e24-1",
        messages: [{ role: "user", text: "Surask Volvo" }],
        context: {
          isAuthenticated: true,
          userCity: "Vilnius",
          contact: "+37060000000",
          profilePhone: "+37060000000",
        },
      });
      assert.equal(res.status, 200);
      const stream = parseLiveStreamBody(String(res.text ?? ""));

      // Wire contract proof.
      assert.ok(stream.finalEvent, "a final event arrived");
      assert.equal(stream.finalEvent!.type, "final");
      assert.ok(stream.finalEvent!.result, "payload is nested under .result");
      assert.equal(stream.finalEvent!.reply, undefined, "no reply on the outer event");

      // Parser unpacks the REAL fields.
      assert.ok(stream.finalResult, "finalResult unpacked");
      assert.ok(stream.finalResult!.reply.length > 0, "reply extracted from .result");
      assert.ok(
        Array.isArray(stream.finalResult!.toolCalls) &&
          stream.finalResult!.toolCalls.some((t) => t.name === "searchListings"),
        "toolCalls extracted from .result"
      );
      const actionType = String((stream.finalResult!.actions as Record<string, unknown>).type ?? "");
      assert.ok(
        ["search", "empty_search"].includes(actionType),
        `actions extracted from .result (type=${actionType})`
      );
      assert.ok(stream.threadId, "threadId extracted from .result.thread");
      assert.ok(stream.anonSessionToken, "anonSessionToken extracted from .result.thread");
    } finally {
      recorder.restore();
      if (prevFetch) globalThis.fetch = prevFetch;
    }
  });

  it("a multi-turn stream keeps the canonical thread identity across turns", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    setPlannerDecisionProviderForTests(async (input) => planTurn(input));
    const recorder = createScriptedModelProvider({
      turns: [[round(text("Radau 1 variantą pagal „Volvo“ — peržiūrėk ekrane."))]],
      exhausted: { parts: [] },
    });
    const prevFetch = recorder.install();
    process.env.GEMINI_API_KEY = "e24-test-key";
    const app = createApp();
    try {
      const first = await request(app).post("/api/vauto-agent/stream").send({
        turnId: "e24-a",
        messages: [{ role: "user", text: "Surask Volvo" }],
        context: { isAuthenticated: true, userCity: "Vilnius", contact: "+37060000000", profilePhone: "+37060000000" },
      });
      const s1 = parseLiveStreamBody(String(first.text ?? ""));
      assert.ok(s1.threadId && s1.anonSessionToken);

      const second = await request(app).post("/api/vauto-agent/stream").send({
        threadId: s1.threadId,
        anonSessionToken: s1.anonSessionToken,
        turnId: "e24-b",
        messages: [{ role: "user", text: "tik su balkonu" }],
        context: { isAuthenticated: true, userCity: "Vilnius", contact: "+37060000000", profilePhone: "+37060000000" },
      });
      const s2 = parseLiveStreamBody(String(second.text ?? ""));
      assert.equal(s2.threadId, s1.threadId, "canonical thread continues");
    } finally {
      recorder.restore();
      if (prevFetch) globalThis.fetch = prevFetch;
    }
  });

  it("an SSE error event surfaces as an explicit ERROR — never reply=\"\"", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    setPlannerDecisionProviderForTests(async (input) => planTurn(input));
    // NO GEMINI_API_KEY → the route's agent-unavailable gate fires.
    delete process.env.GEMINI_API_KEY;
    const app = createApp();
    const res = await request(app).post("/api/vauto-agent/stream").send({
      turnId: "e24-err",
      messages: [{ role: "user", text: "Ką tu gali?" }],
      context: { isAuthenticated: true, userCity: "Vilnius", contact: "+37060000000", profilePhone: "+37060000000" },
    });
    const stream = parseLiveStreamBody(String(res.text ?? ""));

    const finalResult = stream.finalResult;
    const fabricatedReply = finalResult && finalResult.reply ? finalResult.reply : "";
    assert.equal(finalResult, null, "no final payload on an errored turn");
    assert.ok(stream.errorEvent, "the error event is surfaced");
    assert.equal(stream.errorEvent!.code, "agent_unavailable");
    assert.ok(stream.errorEvent!.message.length > 0, "the error message is surfaced");
    // The measurement layer must NOT synthesize a reply from an error.
    assert.equal(fabricatedReply, "", "no reply is fabricated (callers read errorEvent instead)");
  });

  it("the parser ignores status/tool_call events and only final/error drive the outcome", () => {
    const body = [
      `data: {"type":"status","message":"Galvoju…"}`,
      `data: {"type":"tool_call","name":"searchListings","message":"Ieškau…"}`,
      `data: {"type":"final","result":{"ok":true,"reply":"atsakymas","toolCalls":[{"name":"searchListings","result":{"count":0}}],"actions":{"type":"empty_search","searchQuery":"Volvo"},"thread":{"threadId":"thr_1","version":2,"anonSessionToken":"tok_1"}}}`,
    ].join("\n\n");
    const stream = parseLiveStreamBody(body);
    assert.equal(stream.statusEvents, 1);
    assert.ok(stream.finalResult);
    assert.equal(stream.finalResult!.reply, "atsakymas");
    assert.equal(stream.finalResult!.toolCalls[0]!.name, "searchListings");
    assert.equal((stream.finalResult!.actions as { searchQuery?: string }).searchQuery, "Volvo");
    assert.equal(stream.threadId, "thr_1");
    assert.equal(stream.errorEvent, null);
  });

  it("malformed SSE lines never crash the parser and never fabricate a reply", () => {
    const body = [
      `data: {not-json`,
      `data: {"type":"error","code":"turn_indeterminate","message":"indeterminate"}`,
    ].join("\n\n");
    const stream = parseLiveStreamBody(body);
    assert.equal(stream.finalResult, null);
    assert.equal(stream.errorEvent?.code, "turn_indeterminate");
  });
});
