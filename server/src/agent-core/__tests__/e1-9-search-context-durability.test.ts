/**
 * E1.9 — production-path conversational search-state durability.
 *
 * Proves the REAL thread-service WRITES the resolved R4.2 search state
 * (subject / preferences / alternatives / activeSearchFilters) into the
 * thread's `search_context`, and a FRESH store instance over the same DB
 * restores it for the next turn WITHOUT the client resending anything.
 *
 * The model (agentRunner) is stubbed; the thread service + Postgres store are
 * the real production path.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import {
  runThreadTurn,
  setThreadAgentForTests,
} from "../thread-service.js";
import {
  PostgresThreadStore,
  type ThreadQueryable,
} from "../thread-store.js";
import { setThreadStoreForTests } from "../thread-store-instance.js";
import type {
  VautoAgentRequest,
  VautoAgentResponse,
} from "../../ai/vauto-agent.js";

const TEST_URL = process.env.TEST_DATABASE_URL?.trim() || "";
const USE_REAL_PG = Boolean(TEST_URL);

const AGENT_THREADS_DDL = `
CREATE TABLE IF NOT EXISTS agent_threads (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  anon_session_token_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_turn_id TEXT,
  listing_draft JSONB,
  listing_flow_state TEXT,
  search_context JSONB,
  pending_confirmations JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_threads_owner_idx ON agent_threads (owner_user_id);
`;
const AGENT_TURNS_DDL = `
CREATE TABLE IF NOT EXISTS agent_turns (
  thread_id TEXT NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved',
  user_text TEXT NOT NULL,
  assistant_reply TEXT,
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, turn_id)
);
`;

let pool: pg.Pool | null = null;
let pglite: PGlite | null = null;

function makeQueryable(): ThreadQueryable {
  if (pool) {
    return {
      query: async <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) =>
        (await pool!.query<T>(text, params)).rows,
    };
  }
  return {
    query: async <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) => {
      const res = await pglite!.query<T>(text, params as never[]);
      return (res.rows ?? []) as T[];
    },
  };
}

async function applyDdl(sql: string): Promise<void> {
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
    return;
  }
  await pglite!.exec(sql);
}

before(async () => {
  if (USE_REAL_PG) pool = new pg.Pool({ connectionString: TEST_URL, max: 4 });
  else pglite = new PGlite();
  await applyDdl(AGENT_THREADS_DDL);
  await applyDdl(AGENT_TURNS_DDL);
});

after(async () => {
  setThreadAgentForTests(null);
  setThreadStoreForTests(null);
  if (pool) await pool.end();
  if (pglite) await pglite.close();
});

describe("E1.9 — R4.2 search state is server-durable across an instance replacement", () => {
  it("restores subject/preferences/alternatives WITHOUT client resend", async () => {
    const capturedContexts: Array<Record<string, unknown>> = [];
    const stubAgent = (async (req: VautoAgentRequest): Promise<VautoAgentResponse> => {
      capturedContexts.push(req.context as unknown as Record<string, unknown>);
      return {
        ok: true,
        reply: "Radau variantus.",
        toolCalls: [],
        actions: {
          type: "search",
          searchQuery: "BMW",
          listingIds: [],
          filters: {
            query: "BMW",
            maxPrice: 20000,
            preferences: {
              bodyType: "universalas",
              alternatives: ["Audi A4"],
              exclusions: ["dyzelis"],
            },
          },
        },
        subject: "BMW 320",
      };
    }) as typeof import("../../ai/vauto-agent.js").runVautoAgent;

    setThreadAgentForTests(stubAgent);

    // Instance A.
    const storeA = new PostgresThreadStore(makeQueryable());
    setThreadStoreForTests(storeA);

    // Turn 1: establish the search (server generates the thread id).
    const r1 = await runThreadTurn({
      threadId: null,
      authUserId: "user_a",
      clientMessages: [{ role: "user", text: "Ieškau BMW iki 20k" }],
      context: {},
      turnId: "turn_1",
    });
    const threadId = r1.thread.threadId;

    // Turn 2: add soft preference + alternative (same server-owned thread).
    await runThreadTurn({
      threadId,
      authUserId: "user_a",
      clientMessages: [{ role: "user", text: "Geriau universalas, gali būti ir Audi" }],
      context: {},
      turnId: "turn_2",
    });

    // Verify the REAL write path persisted searchContext.
    const persisted = await storeA.get(threadId);
    const sc = persisted?.searchContext as
      | { subject?: string; activeSearchFilters?: { query?: string; preferences?: { bodyType?: string; alternatives?: string[] } } }
      | null;
    assert.equal(sc?.subject, "BMW 320");
    assert.equal(sc?.activeSearchFilters?.query, "BMW");
    assert.equal(sc?.activeSearchFilters?.preferences?.bodyType, "universalas");
    assert.deepEqual(sc?.activeSearchFilters?.preferences?.alternatives, ["Audi A4"]);

    // "Process restart": fresh store instance over the same DB.
    const storeB = new PostgresThreadStore(makeQueryable());
    setThreadStoreForTests(storeB);

    // Turn 3 (fresh client, NO resend of activeSearchFilters/subject/preferences).
    capturedContexts.length = 0;
    await runThreadTurn({
      threadId,
      authUserId: "user_a",
      clientMessages: [{ role: "user", text: "O kiek toks kainuotų?" }],
      context: {}, // empty client context — no R4.2 state supplied
      turnId: "turn_3",
    });

    assert.equal(capturedContexts.length, 1);
    const restored = capturedContexts[0]!.threadSearchContext as
      | { subject?: string; activeSearchFilters?: { query?: string; preferences?: { bodyType?: string; alternatives?: string[] } } }
      | null;
    assert.ok(restored, "restored search context injected into the agent request");
    assert.equal(restored!.subject, "BMW 320");
    assert.equal(restored!.activeSearchFilters?.query, "BMW");
    assert.equal(restored!.activeSearchFilters?.preferences?.bodyType, "universalas");
    assert.deepEqual(restored!.activeSearchFilters?.preferences?.alternatives, ["Audi A4"]);
  });

  it("a different user cannot load the persisted thread (ownership isolation)", async () => {
    const store = new PostgresThreadStore(makeQueryable());
    setThreadStoreForTests(store);
    const stub = (async (req: VautoAgentRequest): Promise<VautoAgentResponse> => ({
      ok: true,
      reply: "OK",
      toolCalls: [],
      actions: { type: "search", searchQuery: "BMW", listingIds: [], filters: { query: "BMW" } },
      subject: "BMW",
    })) as typeof import("../../ai/vauto-agent.js").runVautoAgent;
    setThreadAgentForTests(stub);

    const r1 = await runThreadTurn({
      threadId: null,
      authUserId: "user_a",
      clientMessages: [{ role: "user", text: "Ieškau BMW" }],
      context: {},
      turnId: "iso_1",
    });

    // user_b must NOT continue user_a's thread.
    await assert.rejects(
      runThreadTurn({
        threadId: r1.thread.threadId,
        authUserId: "user_b",
        clientMessages: [{ role: "user", text: "Tęsiu" }],
        context: {},
        turnId: "iso_2",
      }),
      /thread_ownership_violation/
    );
  });
});
