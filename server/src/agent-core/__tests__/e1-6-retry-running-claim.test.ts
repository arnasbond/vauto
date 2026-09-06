/**
 * E1.6 — retry running-claim atomicity.
 *
 * The failed_before_execution retry path must acquire the right to run
 * ATOMICALLY (failed_before_execution → running). A concurrent duplicate
 * request may NEVER claim the same turn and launch the agent/tools a
 * second time.
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
  return { ok: true, reply: `atsakymas:${text}`, toolCalls: [], actions: { type: "none" } };
}

function installSpyAgent(delayMs = 0) {
  let executions = 0;
  let sideEffects = 0;
  setThreadAgentForTests((async (req: import("../../ai/vauto-agent.js").VautoAgentRequest) => {
    executions += 1;
    sideEffects += 1; // every pipeline run performs at least one tool side effect
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const last = [...req.messages].reverse().find((m) => m.role === "user");
    return responseFor(String(last?.text ?? ""));
  }) as Parameters<typeof setThreadAgentForTests>[0]);
  return {
    get executions() { return executions; },
    get sideEffects() { return sideEffects; },
  };
}

/** Prepare a turn ledger entry in failed_before_execution (no user message in
 *  the thread yet, no agent ever executed). */
async function prepareFailedBeforeExecution(
  threadId: string,
  turnId: string,
  userText: string
) {
  const store = getThreadStore();
  const now = new Date().toISOString();
  await store.reserveTurn({
    turnId,
    threadId,
    status: "reserved",
    userText,
    assistantReply: null,
    responseJson: null,
    createdAt: now,
    updatedAt: now,
  });
  await store.markTurnRunning(threadId, turnId);
  const done = await store.completeTurn(threadId, turnId, {
    status: "failed_before_execution",
    assistantReply: null,
    responseJson: null,
  });
  assert.equal(done.ok, true, "preparation: running → failed_before_execution");
}

describe("E1.6 — retry running-claim atomicity", () => {
  it("store level: concurrent retryTurn on the same turnId → EXACTLY one winner, status = running", async () => {
    const store = new InMemoryThreadStore();
    setThreadStoreForTests(store);
    const threadId = "thr-e16";
    await store.create({
      threadId,
      ownerUserId: null,
      anonSessionTokenHash: null,
      version: 1,
      messages: [],
      lastTurnId: null,
      listingDraft: null,
      listingFlowState: null,
      searchContext: null,
      pendingConfirmations: [],
      currentIntent: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await prepareFailedBeforeExecution(threadId, "e16-race", "e16 žinutė");

    const [r1, r2] = await Promise.allSettled([
      store.retryTurn(threadId, "e16-race"),
      store.retryTurn(threadId, "e16-race"),
    ]);
    const wins = [r1, r2].filter((r) => r.status === "fulfilled" && r.value.ok).length;
    assert.equal(wins, 1, "exactly one concurrent retryTurn wins the claim");

    const turn = await store.getTurn(threadId, "e16-race");
    assert.equal(turn?.status, "running", "the winner holds the atomic running claim");
  });

  it("concurrent same-turnId requests after failed_before_execution → exactly 1 execution, 1 side effect, 1 canonical message, final completed", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent(50);

    const t1 = await runThreadTurn({
      turnId: "e16-root",
      clientMessages: [{ role: "user", text: "šaknis" }],
    });
    const token = t1.thread.anonSessionToken!;
    assert.equal(spy.executions, 1);

    await prepareFailedBeforeExecution(t1.thread.threadId, "e16-race", "e16 žinutė");

    const [r1, r2] = await Promise.allSettled([
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "e16-race",
        clientMessages: [{ role: "user", text: "e16 žinutė" }],
      }),
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "e16-race",
        clientMessages: [{ role: "user", text: "e16 žinutė" }],
      }),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
    const rejected = [r1, r2].filter((r) => r.status === "rejected");
    assert.ok(fulfilled.length >= 1, "the winner must fulfill");
    assert.ok(
      fulfilled.length + rejected.length === 2 &&
        (rejected.length === 0 ||
          /turn_in_progress/.test(String((rejected[0] as PromiseRejectedResult).reason))),
      "the loser either got turn_in_progress (timing) or a completed replay"
    );

    assert.equal(spy.executions, 2, "agent executed EXACTLY once for the raced turn (1 root + 1)");
    assert.equal(spy.sideEffects, 2, "tool side effects EXACTLY once for the raced turn");

    const final = await getThreadStore().get(t1.thread.threadId);
    assert.equal(
      final!.messages.filter((m) => m.role === "user" && m.text === "e16 žinutė").length,
      1,
      "canonical user message appears exactly once"
    );

    const turn = await getThreadStore().getTurn(t1.thread.threadId, "e16-race");
    assert.equal(turn?.status, "completed", "final ledger status is completed — no double execution");
  });

  it("sequential: failed_before_execution → explicit retry → completed → replay, executions = 1", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent();

    const t1 = await runThreadTurn({
      turnId: "e16-root-2",
      clientMessages: [{ role: "user", text: "šaknis" }],
    });
    const token = t1.thread.anonSessionToken!;

    await prepareFailedBeforeExecution(t1.thread.threadId, "e16-seq", "e16 seq žinutė");

    const retried = await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "e16-seq",
      clientMessages: [{ role: "user", text: "e16 seq žinutė" }],
    });
    assert.equal(retried.response.reply, "atsakymas:e16 seq žinutė");
    assert.equal(spy.executions, 2, "root + exactly ONE retry execution");

    const replay = await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "e16-seq",
      clientMessages: [{ role: "user", text: "e16 seq žinutė" }],
    });
    assert.equal(replay.response.reply, "atsakymas:e16 seq žinutė");
    assert.equal(spy.executions, 2, "completed replay adds ZERO executions");

    const final = await getThreadStore().get(t1.thread.threadId);
    assert.equal(
      final!.messages.filter((m) => m.role === "user" && m.text === "e16 seq žinutė").length,
      1,
      "canonical user message exactly once"
    );
  });
});
