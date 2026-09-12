/**
 * E1.8 — durable conversation-state restart test (real Postgres, or PGlite
 * fallback so local suites stay green without Docker).
 *
 * Simulates a process-instance replacement: store instance A writes a realistic
 * thread (messages, listing draft, search context incl. subject/preferences/
 * alternatives, pending confirmations, current intent, turn ledger), then a
 * FRESH store instance B over the same DB reloads it. Proves server-side
 * continuity does not depend on in-memory state or the browser.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import {
  PostgresThreadStore,
  type ThreadQueryable,
  type ThreadRecord,
} from "../thread-store.js";

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
CREATE INDEX IF NOT EXISTS agent_threads_anon_idx ON agent_threads (anon_session_token_hash);
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
      query: async <T extends import("pg").QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<T[]> => (await pool!.query<T>(text, params)).rows,
    };
  }
  return {
    query: async <T extends import("pg").QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<T[]> => {
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

function realisticRecord(over: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    threadId: "thr_1",
    ownerUserId: "user_a",
    anonSessionTokenHash: "anon_a",
    version: 1,
    messages: [
      { role: "user", text: "Ieškau BMW iki 20k", at: "2026-01-01T00:00:00Z", seq: 1 },
      { role: "assistant", text: "Radau kelis variantus.", at: "2026-01-01T00:00:01Z", seq: 2 },
    ],
    lastTurnId: "turn_1",
    listingDraft: {
      title: "BMW 320",
      category: "vehicles",
      price: 18000,
      location: "Vilnius",
      attributes: { bodyType: "universalas", userCorrectedFields: "color" },
    },
    listingFlowState: "DRAFTING_TEXT",
    searchContext: {
      subject: "BMW 320",
      preferences: {
        bodyType: "universalas",
        preferredLocation: "Vilnius",
        alternatives: ["Audi A4"],
        exclusions: ["dyzelis"],
      },
      activeSearchFilters: { query: "BMW", maxPrice: 20000 },
    },
    pendingConfirmations: [{ id: "pend_1", type: "markListingSold", targetId: "lt_1", at: "2026-01-01T00:00:00Z" }],
    currentIntent: "catalog_search",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

before(async () => {
  if (USE_REAL_PG) {
    pool = new pg.Pool({ connectionString: TEST_URL, max: 4 });
  } else {
    pglite = new PGlite();
  }
  await applyDdl(AGENT_THREADS_DDL);
  await applyDdl(AGENT_TURNS_DDL);
});

after(async () => {
  if (pool) await pool.end();
  if (pglite) await pglite.close();
});

describe("E1.8 — Postgres thread store survives an instance replacement", () => {
  it("full thread payload round-trips across two fresh store instances", async () => {
    // Instance A: write.
    const storeA = new PostgresThreadStore(makeQueryable());
    await storeA.create(realisticRecord());
    await storeA.reserveTurn({
      threadId: "thr_1",
      turnId: "turn_1",
      status: "reserved",
      userText: "Ieškau BMW iki 20k",
      assistantReply: null,
      responseJson: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    await storeA.completeTurn("thr_1", "turn_1", {
      status: "completed",
      assistantReply: "Radau kelis variantus.",
      responseJson: { ok: true },
    });

    // "Process restart": a fresh store instance over the SAME DB.
    const storeB = new PostgresThreadStore(makeQueryable());
    const reloaded = await storeB.get("thr_1");

    assert.ok(reloaded, "thread survives instance replacement");
    assert.equal(reloaded!.messages.length, 2);
    assert.equal(reloaded!.messages[0]!.text, "Ieškau BMW iki 20k");
    assert.equal(reloaded!.listingDraft?.title, "BMW 320");
    assert.equal(reloaded!.listingFlowState, "DRAFTING_TEXT");
    assert.equal(reloaded!.currentIntent, "catalog_search");
    assert.equal(reloaded!.pendingConfirmations.length, 1);

    // R4.2 continuity fields carried inside searchContext (JSONB) survive.
    const sc = reloaded!.searchContext as Record<string, unknown> | null;
    assert.equal(sc?.subject, "BMW 320");
    assert.deepEqual((sc?.preferences as { alternatives?: string[] })?.alternatives, ["Audi A4"]);

    // Turn ledger survives too.
    const turn = await storeB.getTurn("thr_1", "turn_1");
    assert.equal(turn?.status, "completed");
    assert.equal(turn?.assistantReply, "Radau kelis variantus.");
  });

  it("two users' threads remain isolated across an instance replacement", async () => {
    const storeA = new PostgresThreadStore(makeQueryable());
    await storeA.create(
      realisticRecord({ threadId: "thr_a", ownerUserId: "user_a" })
    );
    await storeA.create(
      realisticRecord({ threadId: "thr_b", ownerUserId: "user_b" })
    );

    const storeB = new PostgresThreadStore(makeQueryable());
    const a = await storeB.get("thr_a");
    const b = await storeB.get("thr_b");
    assert.equal(a?.ownerUserId, "user_a");
    assert.equal(b?.ownerUserId, "user_b");
    assert.notEqual(a?.threadId, b?.threadId);
  });
});
