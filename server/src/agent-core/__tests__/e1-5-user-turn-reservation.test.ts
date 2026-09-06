/**
 * E1.5 — user-turn reservation completion (closes the last E1 race).
 *
 * `runThreadTurn` may proceed to agent/model/tool execution ONLY with a
 * PROVEN persisted user turn. Three stale-version conflicts at the
 * user-turn append stage fail CLOSED: no execution, ledger →
 * failed_before_execution, thread_update_contention, safe explicit retry.
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

function installSpyAgent() {
  let executions = 0;
  let sideEffects = 0;
  const texts: string[] = [];
  setThreadAgentForTests((async (req: import("../../ai/vauto-agent.js").VautoAgentRequest) => {
    executions += 1;
    sideEffects += 1; // each pipeline run performs at least one tool side effect
    const last = [...req.messages].reverse().find((m) => m.role === "user");
    texts.push(String(last?.text ?? ""));
    return responseFor(String(last?.text ?? ""));
  }) as Parameters<typeof setThreadAgentForTests>[0]);
  return {
    get executions() { return executions; },
    get sideEffects() { return sideEffects; },
    texts,
  };
}

describe("E1.5 — user-turn reservation completion", () => {
  it("3 stale conflicts at user-turn append → NO execution, failed_before_execution, safe explicit retry, user message persisted once", async () => {
    const base = new InMemoryThreadStore();
    let armed = false;
    let staleRemaining = 0;
    const seam = Object.assign(
      Object.create(Object.getPrototypeOf(base)),
      base,
      {
        reserveTurn: (async (turn: Parameters<InMemoryThreadStore["reserveTurn"]>[0]) => {
          if (turn.turnId === "e15-flaky" && !armed) {
            armed = true;
            staleRemaining = 3;
          }
          return base.reserveTurn(turn);
        }) as InMemoryThreadStore["reserveTurn"],
        update: (async (...args: Parameters<InMemoryThreadStore["update"]>) => {
          if (armed && staleRemaining > 0) {
            staleRemaining -= 1;
            return { ok: false as const, reason: "stale_version" as const };
          }
          return base.update(...args);
        }) as InMemoryThreadStore["update"],
      }
    ) as InMemoryThreadStore;
    setThreadStoreForTests(seam);
    const spy = installSpyAgent();

    const t1 = await runThreadTurn({
      turnId: "e15-root",
      clientMessages: [{ role: "user", text: "šaknis" }],
    });
    const token = t1.thread.anonSessionToken!;
    assert.equal(spy.executions, 1, "root turn executes normally");

    // First attempt: ALL THREE reservation updates return stale_version.
    await assert.rejects(
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "e15-flaky",
        clientMessages: [{ role: "user", text: "e15 flaky žinutė" }],
      }),
      /thread_update_contention/
    );
    assert.equal(spy.executions, 1, "agent NOT executed after failed reservation");
    assert.equal(spy.sideEffects, 1, "tool side effects = 0 for the failed turn");

    const turn = await getThreadStore().getTurn(t1.thread.threadId, "e15-flaky");
    assert.equal(turn?.status, "failed_before_execution");

    // Explicit retry with the SAME turnId after the conflict clears.
    const retried = await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "e15-flaky",
      clientMessages: [{ role: "user", text: "e15 flaky žinutė" }],
    });
    assert.equal(retried.response.reply, "atsakymas:e15 flaky žinutė");
    assert.equal(spy.executions, 2, "exactly one execution on the safe retry");

    const final = await getThreadStore().get(t1.thread.threadId);
    assert.equal(
      final!.messages.filter((m) => m.role === "user" && m.text === "e15 flaky žinutė").length,
      1,
      "user message in the canonical thread appears exactly once"
    );
  });

  it("two concurrent turns with permanent append conflict → only the persisted user message executes; the other fails closed BEFORE model/tools", async () => {
    const base = new InMemoryThreadStore();
    let forcedLoseConflicts = 0;
    const seam = Object.assign(
      Object.create(Object.getPrototypeOf(base)),
      base,
      {
        update: (async (...args: Parameters<InMemoryThreadStore["update"]>) => {
          const [threadId, updater] = args;
          const probeCurrent = await base.get(threadId);
          if (probeCurrent) {
            const probe = updater(probeCurrent);
            if (probe.lastTurnId === "lose-turn") {
              forcedLoseConflicts += 1;
              return { ok: false as const, reason: "stale_version" as const };
            }
          }
          return base.update(...args);
        }) as InMemoryThreadStore["update"],
      }
    ) as InMemoryThreadStore;
    setThreadStoreForTests(seam);
    const spy = installSpyAgent();

    const t1 = await runThreadTurn({
      turnId: "e15-root",
      clientMessages: [{ role: "user", text: "šaknis" }],
    });
    const token = t1.thread.anonSessionToken!;

    const [win, lose] = await Promise.allSettled([
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "win-turn",
        clientMessages: [{ role: "user", text: "win žinutė" }],
      }),
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "lose-turn",
        clientMessages: [{ role: "user", text: "lose žinutė" }],
      }),
    ]);

    assert.equal(win.status, "fulfilled", "the turn whose user message persisted executes");
    assert.equal(lose.status, "rejected", "the turn whose user message never persisted fails closed");
    assert.match(String((lose as PromiseRejectedResult).reason), /thread_update_contention/);

    assert.equal(
      spy.texts.filter((t) => t.includes("win žinutė")).length,
      1,
      "win turn executed exactly once"
    );
    assert.equal(
      spy.texts.filter((t) => t.includes("lose žinutė")).length,
      0,
      "lose turn NEVER reached the agent/model/tools"
    );
    assert.ok(forcedLoseConflicts >= 3, "lose turn burned all its reservation retries");

    const loseTurn = await getThreadStore().getTurn(t1.thread.threadId, "lose-turn");
    assert.equal(loseTurn?.status, "failed_before_execution");

    const final = await getThreadStore().get(t1.thread.threadId);
    const userTexts = final!.messages.filter((m) => m.role === "user").map((m) => m.text);
    assert.equal(userTexts.filter((t) => t === "win žinutė").length, 1);
    assert.equal(
      userTexts.filter((t) => t === "lose žinutė").length,
      0,
      "unpersisted user message does NOT enter the canonical thread"
    );
  });
});
