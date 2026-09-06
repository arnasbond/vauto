/**
 * E1.3 — turn idempotency completion (exactly-once turn semantics).
 *
 * Same turnId: reserved → in-progress fail-closed; completed → the persisted
 * response is replayed WITHOUT re-running the agent/tools; failed → explicit
 * atomic retry transition. Reservation is atomic per (thread_id, turn_id).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { InMemoryThreadStore } from "../thread-store.js";
import { setThreadStoreForTests, getThreadStore } from "../thread-store-instance.js";
import { runThreadTurn, setThreadAgentForTests } from "../thread-service.js";
import type { VautoAgentResponse } from "../../ai/vauto-agent.js";

afterEach(() => {
  setThreadStoreForTests(null);
  setThreadAgentForTests(null);
});

function responseFor(text: string): VautoAgentResponse {
  return {
    ok: true,
    reply: `atsakymas:${text}`,
    toolCalls: [],
    actions: { type: "none" },
  };
}

function installSpyAgent(delayMs: number) {
  let executions = 0;
  const texts: string[] = [];
  setThreadAgentForTests((async (req: import("../../ai/vauto-agent.js").VautoAgentRequest) => {
    executions += 1;
    const last = [...req.messages].reverse().find((m) => m.role === "user");
    texts.push(String(last?.text ?? "").slice(0, 40));
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return responseFor(String(last?.text ?? ""));
  }) as Parameters<typeof setThreadAgentForTests>[0]);
  return {
    get executions() {
      return executions;
    },
    texts,
  };
}

describe("E1.3 — turn idempotency (exactly-once)", () => {
  it("same turnId sequential replay → agent execution count = 1", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent(0);
    const t1 = await runThreadTurn({
      clientMessages: [{ role: "user", text: "pirmas" }],
    });
    const token = t1.thread.anonSessionToken!;

    const first = await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "turn-X",
      clientMessages: [{ role: "user", text: "idempotentinė žinutė" }],
    });
    const replay = await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "turn-X",
      clientMessages: [{ role: "user", text: "idempotentinė žinutė" }],
    });

    assert.equal(
      spy.texts.filter((t) => t.includes("idempotentinė")).length,
      1,
      "same turnId executes the agent exactly once"
    );
    assert.equal(replay.response.reply, first.response.reply, "replay returns the SAME persisted response");
  });

  it("same turnId concurrent replay → agent execution count = 1", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent(40);
    const t1 = await runThreadTurn({
      clientMessages: [{ role: "user", text: "pirmas" }],
    });
    const token = t1.thread.anonSessionToken!;

    const [a, b] = await Promise.allSettled([
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "turn-C",
        clientMessages: [{ role: "user", text: "concurrent žinutė" }],
      }),
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "turn-C",
        clientMessages: [{ role: "user", text: "concurrent žinutė" }],
      }),
    ]);

    const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
    const rejected = [a, b].filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "one concurrent winner");
    assert.equal(rejected.length, 1, "the other fails closed (in-progress)");
    assert.equal(
      spy.texts.filter((t) => t.includes("concurrent žinutė")).length,
      1,
      "agent executed exactly once for the same turnId under concurrency"
    );
  });

  it("completed replay returns the same response without new tool execution", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent(0);
    const t1 = await runThreadTurn({
      clientMessages: [{ role: "user", text: "pirmas" }],
    });
    const token = t1.thread.anonSessionToken!;

    const first = await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "turn-R",
      clientMessages: [{ role: "user", text: "atsakymo šaltinis" }],
    });
    const replay = await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "turn-R",
      clientMessages: [{ role: "user", text: "atsakymo šaltinis" }],
    });
    assert.equal(replay.response.reply, "atsakymas:atsakymo šaltinis");
    assert.equal(first.response.reply, replay.response.reply);
    assert.equal(spy.executions, 2, "initial turn + the turn itself — replay adds ZERO executions");
  });

  it("replay after another later turn still does not duplicate the old turn", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent(0);
    const t1 = await runThreadTurn({
      clientMessages: [{ role: "user", text: "pirmas" }],
    });
    const token = t1.thread.anonSessionToken!;

    await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "senas-turnas",
      clientMessages: [{ role: "user", text: "senoji žinutė" }],
    });
    await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "naujas-turnas",
      clientMessages: [{ role: "user", text: "naujoji žinutė" }],
    });
    const replay = await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "senas-turnas",
      clientMessages: [{ role: "user", text: "senoji žinutė" }],
    });

    assert.equal(replay.response.reply, "atsakymas:senoji žinutė");
    assert.equal(
      spy.texts.filter((t) => t.includes("senoji žinutė")).length,
      1,
      "the old turn is replayed from the ledger, not re-executed"
    );
    const final = await getThreadStore().get(t1.thread.threadId);
    const oldCount = final!.messages.filter(
      (m) => m.role === "user" && m.text === "senoji žinutė"
    ).length;
    assert.equal(oldCount, 1, "no duplicate user message for the old turn");
  });

  it("tool side-effect spy = exactly 1 for a single turnId", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent(0);
    const t1 = await runThreadTurn({
      clientMessages: [{ role: "user", text: "pirmas" }],
    });
    const token = t1.thread.anonSessionToken!;
    await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "spy-turn",
      clientMessages: [{ role: "user", text: "spy žinutė" }],
    });
    assert.equal(spy.texts.filter((t) => t.includes("spy žinutė")).length, 1);
  });

  it("DB-level uniqueness / atomic reservation: concurrent reserveTurn → exactly one winner", async () => {
    const store = new InMemoryThreadStore();
    const turn = {
      turnId: "dup-turn",
      threadId: "thr-1",
      status: "reserved" as const,
      userText: "žinutė",
      assistantReply: null,
      responseJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const [a, b] = await Promise.all([store.reserveTurn(turn), store.reserveTurn(turn)]);
    const wins = [a, b].filter((r) => r.ok);
    assert.equal(wins.length, 1, "atomic reservation grants exactly one winner per (thread, turn)");
    const loser = [a, b].find((r) => !r.ok)!;
    assert.ok(!loser.ok && loser.reason === "duplicate");
  });

  it("E1.4 — agent failure after execution started → INDETERMINATE, replay never re-runs", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    let executions = 0;
    setThreadAgentForTests((async (req: import("../../ai/vauto-agent.js").VautoAgentRequest) => {
      const last = [...req.messages].reverse().find((m) => m.role === "user");
      if (String(last?.text ?? "").includes("sprogstanti žinutė")) {
        executions += 1;
        throw new Error("agent exploded");
      }
      executions += 1;
      return responseFor(String(last?.text ?? ""));
    }) as Parameters<typeof setThreadAgentForTests>[0]);

    const t1 = await runThreadTurn({
      clientMessages: [{ role: "user", text: "pirmas" }],
    });
    const token = t1.thread.anonSessionToken!;

    await assert.rejects(
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "boom-turn",
        clientMessages: [{ role: "user", text: "sprogstanti žinutė" }],
      }),
      /agent exploded/
    );

    // The turn is INDETERMINATE: replay must fail closed WITHOUT re-running
    // the agent/tools.
    await assert.rejects(
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "boom-turn",
        clientMessages: [{ role: "user", text: "sprogstanti žinutė" }],
      }),
      /turn_indeterminate/
    );
    assert.equal(executions, 2, "initial(1) + the single failed execution(1) — replay ZERO");
  });
});
