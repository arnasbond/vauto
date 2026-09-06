/**
 * E1.4 — production turn-id & indeterminate failure semantics.
 *
 * turnId is REQUIRED in the real HTTP/SSE flow; retries reuse it; the server
 * never depends on message-count/hash derivation for production exactly-once.
 * After execution starts, failures are INDETERMINATE (fail-closed, never
 * auto-replayed); only failures BEFORE execution are safely retryable.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import request from "supertest";

import { InMemoryThreadStore } from "../thread-store.js";
import { setThreadStoreForTests, getThreadStore } from "../thread-store-instance.js";
import {
  runThreadTurn,
  setThreadAgentForTests,
  setTurnRunningTimeoutForTests,
} from "../thread-service.js";
import { optionalAuth } from "../../middleware/auth.js";
import { vautoAgentRouter } from "../../routes/vauto-agent.js";
import type { VautoAgentResponse } from "../../ai/vauto-agent.js";

afterEach(() => {
  setThreadStoreForTests(null);
  setThreadAgentForTests(null);
  setTurnRunningTimeoutForTests(2 * 60_000);
});

function responseFor(text: string): VautoAgentResponse {
  return { ok: true, reply: `atsakymas:${text}`, toolCalls: [], actions: { type: "none" } };
}

function installSpyAgent() {
  let executions = 0;
  const texts: string[] = [];
  setThreadAgentForTests((async (req: import("../../ai/vauto-agent.js").VautoAgentRequest) => {
    executions += 1;
    const last = [...req.messages].reverse().find((m) => m.role === "user");
    texts.push(String(last?.text ?? "").slice(0, 40));
    return responseFor(String(last?.text ?? ""));
  }) as Parameters<typeof setThreadAgentForTests>[0]);
  return { get executions() { return executions; }, texts };
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(optionalAuth);
  app.use("/api/vauto-agent", vautoAgentRouter);
  return app;
}

async function installEmptyModelFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("generativelanguage.googleapis.com")) {
      return original(input, init);
    }
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
  process.env.GEMINI_API_KEY = "e1.4-key";
  return () => {
    globalThis.fetch = original;
    delete process.env.GEMINI_API_KEY;
  };
}

describe("E1.4 — HTTP: turnId travels through both endpoints", () => {
  it("/stream passes the client turnId; same-request retry → agent execution count = 1", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = await installEmptyModelFetch();
    const spy = installSpyAgent();
    const app = createApp();
    try {
      const body = {
        turnId: "http-turn-1",
        messages: [{ role: "user", text: "HTTP žinutė" }],
        context: { isAuthenticated: true },
      };
      // SSE endpoint (supertest buffers the stream).
      const first = await request(app).post("/api/vauto-agent/stream").send(body);
      assert.equal(first.status, 200);
      const threadMatch = String(first.text).match(/"threadId":"([^"]+)"/);
      assert.ok(threadMatch, "stream must emit thread metadata");
      const tokenMatch = String(first.text).match(/"anonSessionToken":"([^"]+)"/);
      assert.ok(tokenMatch, "stream must emit the anonymous continuation token");
      const threadId = threadMatch![1]!;

      // RETRY: same turnId AND the server-issued threadId + continuation token.
      const second = await request(app)
        .post("/api/vauto-agent/stream")
        .send({ ...body, threadId, anonSessionToken: tokenMatch![1]! });
      assert.equal(second.status, 200);
      assert.equal(
        spy.texts.filter((t) => t.includes("HTTP žinutė")).length,
        1,
        "same HTTP turnId retry executes the agent exactly once"
      );
    } finally {
      restore();
    }
  });

  it("legacy JSON endpoint passes the client turnId; retry replays the same result", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = await installEmptyModelFetch();
    const spy = installSpyAgent();
    const app = createApp();
    try {
      const body = {
        turnId: "json-turn-1",
        messages: [{ role: "user", text: "JSON žinutė" }],
        context: { isAuthenticated: true },
      };
      const first = await request(app).post("/api/vauto-agent").send(body);
      assert.equal(first.status, 200);
      assert.equal(first.body.ok, true);
      const threadId = String(first.body.thread?.threadId ?? "");
      assert.ok(threadId, "JSON endpoint returns thread metadata");
      const anonSessionToken = String(first.body.thread?.anonSessionToken ?? "");
      assert.ok(anonSessionToken, "JSON endpoint returns the anonymous continuation token");

      const second = await request(app)
        .post("/api/vauto-agent")
        .send({ ...body, threadId, anonSessionToken });
      assert.equal(second.status, 200);
      assert.equal(second.body.reply, first.body.reply, "retry replays the SAME persisted result");
      assert.equal(
        spy.texts.filter((t) => t.includes("JSON žinutė")).length,
        1,
        "legacy endpoint uses the same exactly-once turnId"
      );
    } finally {
      restore();
    }
  });

  it("SSE disconnect + retry with the same turnId → model/tools executed once", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = await installEmptyModelFetch();
    const spy = installSpyAgent();
    const app = createApp();
    try {
      const body = {
        turnId: "sse-retry-1",
        messages: [{ role: "user", text: "disconnect žinutė" }],
        context: { isAuthenticated: true },
      };
      // First request completes server-side (the "disconnect" happens after).
      const first = await request(app).post("/api/vauto-agent/stream").send(body);
      const threadMatch = String(first.text).match(/"threadId":"([^"]+)"/);
      assert.ok(threadMatch);
      const tokenMatch = String(first.text).match(/"anonSessionToken":"([^"]+)"/);
      assert.ok(tokenMatch);
      // Retry the SAME turnId + threadId + token (client never received the response).
      const retry = await request(app)
        .post("/api/vauto-agent/stream")
        .send({ ...body, threadId: threadMatch![1]!, anonSessionToken: tokenMatch![1]! });
      assert.equal(retry.status, 200);
      assert.equal(
        spy.texts.filter((t) => t.includes("disconnect žinutė")).length,
        1,
        "SSE retry with the same turnId never re-executes the pipeline"
      );
    } finally {
      restore();
    }
  });
});

describe("E1.4 — idempotency independence from message history", () => {
  it("messages.length change cannot alter the turn identity (client turnId wins)", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = await installEmptyModelFetch();
    const spy = installSpyAgent();
    try {
      const t1 = await runThreadTurn({
        turnId: "turn-root",
        clientMessages: [{ role: "user", text: "šaknis" }],
      });
      const token = t1.thread.anonSessionToken!;
      const first = await runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "turn-ident",
        clientMessages: [{ role: "user", text: "tapatybės žinutė" }],
      });
      // Replay with a DIFFERENT client message array (tampered history) but
      // the SAME turnId — identity must not change.
      const replay = await runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "turn-ident",
        clientMessages: [
          { role: "user", text: "SUKLAMPA HISTORIJA" },
          { role: "user", text: "tapatybės žinutė" },
        ],
      });
      assert.equal(replay.response.reply, first.response.reply);
      assert.equal(
        spy.texts.filter((t) => t.includes("tapatybės žinutė")).length,
        1,
        "turn identity depends on turnId, never on messages.length"
      );
    } finally {
      restore();
    }
  });

  it("old turn replay after several newer turns → persisted response, zero execution", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = await installEmptyModelFetch();
    const spy = installSpyAgent();
    try {
      const t1 = await runThreadTurn({
        turnId: "turn-root-2",
        clientMessages: [{ role: "user", text: "šaknis 2" }],
      });
      const token = t1.thread.anonSessionToken!;
      await runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "senas-1",
        clientMessages: [{ role: "user", text: "senoji žinutė" }],
      });
      await runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "naujas-1",
        clientMessages: [{ role: "user", text: "naujoji žinutė" }],
      });
      const replay = await runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "senas-1",
        clientMessages: [{ role: "user", text: "senoji žinutė" }],
      });
      assert.equal(replay.response.reply, "atsakymas:senoji žinutė");
      assert.equal(
        spy.texts.filter((t) => t.includes("senoji žinutė")).length,
        1
      );
    } finally {
      restore();
    }
  });
});

describe("E1.4 — failure semantics (indeterminate vs safe retry)", () => {
  it("error BEFORE execution (reserve persist fails) → failed_before_execution, safe explicit retry", async () => {
    const base = new InMemoryThreadStore();
    let armFailure = false;
    let failGetsRemaining = 0;
    const flaky = Object.assign(
      Object.create(Object.getPrototypeOf(base)),
      base,
      {
        reserveTurn: (async (turn: Parameters<InMemoryThreadStore["reserveTurn"]>[0]) => {
          if (turn.turnId === "turn-flaky" && !armFailure) {
            armFailure = true;
            failGetsRemaining = 3;
          }
          return base.reserveTurn(turn);
        }) as InMemoryThreadStore["reserveTurn"],
        get: (async (threadId: string) => {
          if (armFailure && failGetsRemaining > 0) {
            failGetsRemaining -= 1;
            return null;
          }
          return base.get(threadId);
        }) as InMemoryThreadStore["get"],
        create: (async (record: import("../thread-store.js").ThreadRecord) => {
          if (armFailure) return record;
          return base.create(record);
        }) as InMemoryThreadStore["create"],
      }
    ) as InMemoryThreadStore;
    setThreadStoreForTests(flaky);
    const restore = await installEmptyModelFetch();
    const spy = installSpyAgent();
    try {
      const t1 = await runThreadTurn({
        turnId: "turn-flaky-root",
        clientMessages: [{ role: "user", text: "šaknis" }],
      });
      const token = t1.thread.anonSessionToken!;

      // First attempt: user-turn persist fails BEFORE any agent execution.
      await assert.rejects(
        runThreadTurn({
          threadId: t1.thread.threadId,
          anonSessionToken: token,
          turnId: "turn-flaky",
          clientMessages: [{ role: "user", text: "flaky žinutė" }],
        }),
        /thread_update_contention/
      );
      assert.equal(
        spy.texts.filter((t) => t.includes("flaky žinutė")).length,
        0,
        "no agent execution before the failure"
      );

      // Explicit retry (same turnId) → failed_before_execution → safe retry.
      const retried = await runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "turn-flaky",
        clientMessages: [{ role: "user", text: "flaky žinutė" }],
      });
      assert.equal(retried.response.reply, "atsakymas:flaky žinutė");
      assert.equal(
        spy.texts.filter((t) => t.includes("flaky žinutė")).length,
        1,
        "the safe retry executed exactly once"
      );
    } finally {
      restore();
    }
  });

  it("tool side effect + later exception → side-effect spy exactly 1, turn INDETERMINATE", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    let sideEffects = 0;
    setThreadAgentForTests((async (req: import("../../ai/vauto-agent.js").VautoAgentRequest) => {
      const last = [...req.messages].reverse().find((m) => m.role === "user");
      if (String(last?.text ?? "").includes("side žinutė")) {
        sideEffects += 1;
        throw new Error("po side effect");
      }
      return responseFor(String(last?.text ?? ""));
    }) as Parameters<typeof setThreadAgentForTests>[0]);
    const restore = await installEmptyModelFetch();
    try {
      const t1 = await runThreadTurn({
        turnId: "turn-side-root",
        clientMessages: [{ role: "user", text: "šaknis" }],
      });
      const token = t1.thread.anonSessionToken!;

      await assert.rejects(
        runThreadTurn({
          threadId: t1.thread.threadId,
          anonSessionToken: token,
          turnId: "turn-side",
          clientMessages: [{ role: "user", text: "side žinutė" }],
        }),
        /po side effect/
      );
      await assert.rejects(
        runThreadTurn({
          threadId: t1.thread.threadId,
          anonSessionToken: token,
          turnId: "turn-side",
          clientMessages: [{ role: "user", text: "side žinutė" }],
        }),
        /turn_indeterminate/
      );
      assert.equal(sideEffects, 1, "side effect executed exactly once; no blind replay");
    } finally {
      restore();
    }
  });

  it("thread persist contention after tool execution → agent execution exactly 1, INDETERMINATE", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    let executions = 0;
    setThreadAgentForTests((async () => {
      executions += 1;
      await new Promise((r) => setTimeout(r, 30));
      return responseFor("lėtas");
    }) as Parameters<typeof setThreadAgentForTests>[0]);
    const restore = await installEmptyModelFetch();
    try {
      const t1 = await runThreadTurn({
        turnId: "turn-cont-root",
        clientMessages: [{ role: "user", text: "šaknis" }],
      });
      const token = t1.thread.anonSessionToken!;

      const slow = runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "turn-cont",
        clientMessages: [{ role: "user", text: "lėta žinutė" }],
      });
      await new Promise((r) => setTimeout(r, 10));
      // External version bump mid-execution → assistant persist loses the race.
      await getThreadStore().update(t1.thread.threadId, (r) => r);

      await assert.rejects(slow, /thread_update_contention/);
      await assert.rejects(
        runThreadTurn({
          threadId: t1.thread.threadId,
          anonSessionToken: token,
          turnId: "turn-cont",
          clientMessages: [{ role: "user", text: "lėta žinutė" }],
        }),
        /turn_indeterminate/
      );
      assert.equal(executions, 2, "initial + the single contended execution — no re-run");
    } finally {
      restore();
    }
  });

  it("failed completeTurn(completed) cannot silently return success", async () => {
    const base = new InMemoryThreadStore();
    let failComplete = true;
    const broken = Object.assign(
      Object.create(Object.getPrototypeOf(base)),
      base,
      {
        completeTurn: (async (
          ...args: Parameters<InMemoryThreadStore["completeTurn"]>
        ) => {
          if (failComplete && args[1] === "turn-ledger") {
            failComplete = false;
            return { ok: false as const, reason: "not_found" as const };
          }
          return base.completeTurn(...args);
        }) as InMemoryThreadStore["completeTurn"],
      }
    ) as InMemoryThreadStore;
    setThreadStoreForTests(broken);
    const restore = await installEmptyModelFetch();
    installSpyAgent();
    try {
      const t1 = await runThreadTurn({
        turnId: "turn-ledger-root",
        clientMessages: [{ role: "user", text: "šaknis" }],
      });
      const token = t1.thread.anonSessionToken!;

      await assert.rejects(
        runThreadTurn({
          threadId: t1.thread.threadId,
          anonSessionToken: token,
          turnId: "turn-ledger",
          clientMessages: [{ role: "user", text: "ledger žinutė" }],
        }),
        /turn_ledger_conflict/
      );
    } finally {
      restore();
    }
  });

  it("stuck running past the timeout → INDETERMINATE (fail-closed)", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const restore = await installEmptyModelFetch();
    installSpyAgent();
    try {
      const t1 = await runThreadTurn({
        turnId: "turn-stuck-root",
        clientMessages: [{ role: "user", text: "šaknis" }],
      });
      const token = t1.thread.anonSessionToken!;
      // Craft a running turn with an old timestamp directly in the ledger.
      await getThreadStore().reserveTurn({
        turnId: "stuck-turn",
        threadId: t1.thread.threadId,
        status: "reserved",
        userText: "stuck žinutė",
        assistantReply: null,
        responseJson: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await getThreadStore().markTurnRunning(t1.thread.threadId, "stuck-turn");
      // Simulate a long-running execution by aging the record via a manual
      // update on a fresh store record is not possible; instead use the
      // timeout seam.
      setTurnRunningTimeoutForTests(1);
      await new Promise((r) => setTimeout(r, 5));

      await assert.rejects(
        runThreadTurn({
          threadId: t1.thread.threadId,
          anonSessionToken: token,
          turnId: "stuck-turn",
          clientMessages: [{ role: "user", text: "stuck žinutė" }],
        }),
        /turn_indeterminate/
      );
    } finally {
      restore();
    }
  });
});
