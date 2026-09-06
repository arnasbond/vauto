/**
 * E1.2 — atomic claim & turn concurrency hardening tests.
 *
 * Proves: exactly-once agent execution per turn (reserve-first, fail-closed
 * on stale), no lost user turns under concurrency, no blind agent re-run
 * after side effects, and an ATOMIC Postgres claim (single conditional
 * UPDATE — no read/check/write TOCTOU) with exactly-one-owner semantics.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  InMemoryThreadStore,
  mintAnonSessionToken,
  newThreadRecord,
  PostgresThreadStore,
  type ThreadQueryable,
  type ThreadRecord,
} from "../thread-store.js";
import { setThreadStoreForTests, getThreadStore } from "../thread-store-instance.js";
import { runThreadTurn, setThreadAgentForTests } from "../thread-service.js";
import type { VautoAgentResponse } from "../../ai/vauto-agent.js";

afterEach(() => {
  setThreadStoreForTests(null);
  setThreadAgentForTests(null);
});

function emptyResponse(reply: string): VautoAgentResponse {
  return { ok: true, reply, toolCalls: [], actions: { type: "none" } };
}

/** Fake pg-like queryable that emulates the atomic UPDATE semantics of the
 *  claim statement (row-level conditional match applied atomically per call,
 *  as a single-statement database would) and logs issued SQL. */
class FakeAtomicDb implements ThreadQueryable {
  rows = new Map<string, ThreadRecord>();
  sqlLog: string[] = [];

  query = async <T extends import("pg").QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<T[]> => {
    this.sqlLog.push(text);
    const normalized = text.replace(/\s+/g, " ").toLowerCase();
    if (normalized.startsWith("update agent_threads")) {
      const id = String(params?.[0]);
      const owner = params?.[1] as string;
      const expectedHash = String(params?.[3]);
      const row = this.rows.get(id);
      const matches =
        row &&
        row.ownerUserId === null &&
        row.anonSessionTokenHash === expectedHash;
      if (!matches) return [] as unknown as T[];
      const updated: ThreadRecord = {
        ...row,
        ownerUserId: owner,
        anonSessionTokenHash: null,
        version: row.version + 1,
        updatedAt: new Date().toISOString(),
      };
      this.rows.set(id, updated);
      return [
        {
          id: updated.threadId,
          owner_user_id: updated.ownerUserId,
          anon_session_token_hash: updated.anonSessionTokenHash,
          version: updated.version,
          messages: updated.messages,
          last_turn_id: updated.lastTurnId,
          listing_draft: updated.listingDraft,
          listing_flow_state: updated.listingFlowState,
          search_context: updated.searchContext,
          pending_confirmations: updated.pendingConfirmations,
          current_intent: updated.currentIntent,
          created_at: updated.createdAt,
          updated_at: updated.updatedAt,
        } as unknown as T,
      ];
    }
    if (normalized.startsWith("select * from agent_threads where id")) {
      const row = this.rows.get(String(params?.[0]));
      if (!row) return [] as unknown as T[];
      return [
        {
          id: row.threadId,
          owner_user_id: row.ownerUserId,
          anon_session_token_hash: row.anonSessionTokenHash,
          version: row.version,
          messages: row.messages,
          last_turn_id: row.lastTurnId,
          listing_draft: row.listingDraft,
          listing_flow_state: row.listingFlowState,
          search_context: row.searchContext,
          pending_confirmations: row.pendingConfirmations,
          current_intent: row.currentIntent,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        } as unknown as T,
      ];
    }
    return [] as unknown as T[];
  };
}

describe("E1.2 — atomic Postgres claim (single conditional UPDATE)", () => {
  it("claim is ONE atomic UPDATE (no read/check/write TOCTOU)", async () => {
    const db = new FakeAtomicDb();
    const token = mintAnonSessionToken();
    const record = newThreadRecord({ anonSessionToken: token });
    db.rows.set(record.threadId, record);
    const store = new PostgresThreadStore(db);

    const result = await store.claimAnonymousThread(record.threadId, "user-1", token);
    assert.equal(result.ok, true);

    const claimSql = db.sqlLog.filter((s) => /update\s+agent_threads/i.test(s));
    assert.equal(claimSql.length, 1, "claim must be exactly ONE atomic UPDATE");
    assert.match(claimSql[0]!, /owner_user_id IS NULL/i);
    assert.match(claimSql[0]!, /anon_session_token_hash = \$4/i);
  });

  it("two concurrent claims with the same token → exactly one success, owner immutable", async () => {
    const db = new FakeAtomicDb();
    const token = mintAnonSessionToken();
    const record = newThreadRecord({ anonSessionToken: token });
    db.rows.set(record.threadId, record);
    const store = new PostgresThreadStore(db);

    const [a, b] = await Promise.all([
      store.claimAnonymousThread(record.threadId, "user-1", token),
      store.claimAnonymousThread(record.threadId, "user-2", token),
    ]);
    const successes = [a, b].filter((r) => r.ok);
    assert.equal(successes.length, 1, "exactly one concurrent claim succeeds");
    const winner = successes[0]!;
    assert.ok(winner.ok);
    const final = db.rows.get(record.threadId)!;
    assert.equal(final.ownerUserId, winner.record.ownerUserId, "final owner is the single winner");

    // Post-claim: the owner can never be changed by a second claim.
    const third = await store.claimAnonymousThread(record.threadId, "user-3", token);
    assert.equal(third.ok, false);
    if (!third.ok) assert.equal(third.reason, "already_bound");
    assert.equal(db.rows.get(record.threadId)!.ownerUserId, winner.record.ownerUserId);
  });
});

describe("E1.2 — turn concurrency: exactly-once agent execution, no lost turns", () => {
  function installSpyAgent(delayMs: (turnText: string) => number) {
    let executions = 0;
    const texts: string[] = [];
    const spy = (async (req: import("../../ai/vauto-agent.js").VautoAgentRequest) => {
      executions += 1;
      const last = [...req.messages].reverse().find((m) => m.role === "user");
      texts.push(String(last?.text ?? "").slice(0, 40));
      const delay = delayMs(String(last?.text ?? ""));
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      return emptyResponse(`ok:${last?.text ?? ""}`);
    }) as Parameters<typeof setThreadAgentForTests>[0];
    setThreadAgentForTests(spy);
    return {
      get executions() {
        return executions;
      },
      texts,
    };
  }

  it("two concurrent different turns → no lost user turn, agent executed exactly once per turn, one contention winner", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent((t) => (t.includes("pirmas") ? 60 : 10));

    const t1 = await runThreadTurn({
      clientMessages: [{ role: "user", text: "pirmas turnas" }],
    });
    const token = t1.thread.anonSessionToken!;

    const [r1, r2] = await Promise.allSettled([
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "turn-A",
        clientMessages: [{ role: "user", text: "lėtas turnas A" }],
      }),
      runThreadTurn({
        threadId: t1.thread.threadId,
        anonSessionToken: token,
        turnId: "turn-B",
        clientMessages: [{ role: "user", text: "greitas turnas B" }],
      }),
    ]);

    const settled = [r1, r2].filter((r) => r.status === "fulfilled").length;
    const rejected = [r1, r2].filter((r) => r.status === "rejected").length;
    assert.equal(settled, 1, "exactly one concurrent turn wins");
    assert.equal(rejected, 1, "the other fails closed with contention");
    // Initial turn + the two concurrent turns — each user text executed
    // EXACTLY once (no blind re-run of the agent pipeline).
    assert.equal(
      spy.texts.filter((t) => t.includes("lėtas turnas A")).length,
      1,
      "turn A executed exactly once"
    );
    assert.equal(
      spy.texts.filter((t) => t.includes("greitas turnas B")).length,
      1,
      "turn B executed exactly once"
    );
    assert.equal(spy.executions, 3, "total executions = initial + A + B (no re-runs)");

    const final = await getThreadStore().get(t1.thread.threadId);
    const userTexts = final!.messages.filter((m) => m.role === "user").map((m) => m.text);
    assert.ok(userTexts.includes("lėtas turnas A"), "no lost user turn A");
    assert.ok(userTexts.includes("greitas turnas B"), "no lost user turn B");
    // No duplicated user turns:
    assert.equal(userTexts.filter((t) => t === "lėtas turnas A").length, 1);
    assert.equal(userTexts.filter((t) => t === "greitas turnas B").length, 1);
  });

  it("forced stale version after the agent result → pipeline NOT executed a second time", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    let executions = 0;
    setThreadAgentForTests((async () => {
      executions += 1;
      // Simulate a slow agent; meanwhile an external bump happens.
      await new Promise((r) => setTimeout(r, 20));
      return emptyResponse("atsakymas");
    }) as Parameters<typeof setThreadAgentForTests>[0]);

    const t1 = await runThreadTurn({
      clientMessages: [{ role: "user", text: "pirmas" }],
    });
    const token = t1.thread.anonSessionToken!;

    // Kick off the slow turn, and bump the version externally mid-flight.
    const slow = runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "slow-turn",
      clientMessages: [{ role: "user", text: "lėtas" }],
    });
    await new Promise((r) => setTimeout(r, 5));
    const store = getThreadStore();
    await store.update(t1.thread.threadId, (r) => r);

    await assert.rejects(slow, /thread_update_contention/);
    // Initial turn (1) + the slow turn (1) — and NO second execution after
    // the stale persist failure.
    assert.equal(executions, 2, "agent pipeline executed exactly once per turn — no blind re-run");
  });

  it("side-effect spy counter is exactly 1 for a single uncontended turn", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent(() => 0);
    await runThreadTurn({
      clientMessages: [{ role: "user", text: "vienas turnas" }],
    });
    assert.equal(spy.executions, 1);
  });

  it("idempotent turnId: replaying the same turn does not duplicate the user message NOR re-execute the agent", async () => {
    setThreadStoreForTests(new InMemoryThreadStore());
    const spy = installSpyAgent(() => 0);
    const t1 = await runThreadTurn({
      clientMessages: [{ role: "user", text: "pirmas" }],
    });
    const token = t1.thread.anonSessionToken!;
    await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "fixed-key",
      clientMessages: [{ role: "user", text: "kartojamas" }],
    });
    await runThreadTurn({
      threadId: t1.thread.threadId,
      anonSessionToken: token,
      turnId: "fixed-key",
      clientMessages: [{ role: "user", text: "kartojamas" }],
    });
    const final = await getThreadStore().get(t1.thread.threadId);
    const dupes = final!.messages.filter((m) => m.role === "user" && m.text === "kartojamas");
    assert.equal(dupes.length, 1, "replayed turnId must not duplicate the user turn");
    // E1.3 — the repeated turnId must NOT re-execute the agent pipeline.
    assert.equal(
      spy.texts.filter((t) => t.includes("kartojamas")).length,
      1,
      "same turnId executes the agent exactly once"
    );
  });
});
