/**
 * Pre-production blocker fix — PostgresThreadStore last_turn_id persistence.
 *
 * A tiny in-memory PG-sim exercises the REAL SQL the store issues
 * (INSERT/UPDATE/SELECT shapes parsed from the actual query text), proving:
 *  - create persists ThreadRecord.lastTurnId;
 *  - update overwrites it;
 *  - read-back via get() (rowToThread) returns the same value;
 *  - null round-trips as NULL;
 *  - the E1.5 idempotent-reservation fast-path can rely on the persisted
 *    lastTurnId (store.get returns it after an update).
 *
 * NO real PostgreSQL, NO migration apply.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PostgresThreadStore, type ThreadRecord, type ThreadQueryable } from "../thread-store.js";

function threadRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "thr_pg_1",
    owner_user_id: null,
    anon_session_token_hash: "hash_1",
    version: 1,
    last_turn_id: null,
    messages: [] as unknown[],
    listing_draft: null,
    listing_flow_state: null,
    search_context: null,
    pending_confirmations: [] as unknown[],
    current_intent: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

/** Minimal PG-sim that understands the store's exact query shapes. */
function createPgSim() {
  const rows = new Map<string, Record<string, unknown>>();
  const db: ThreadQueryable = {
    query: async <T extends import("pg").QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<T[]> => {
      if (text.includes("INSERT INTO agent_threads")) {
        const colMatch = text.match(/INSERT INTO agent_threads\s*\(([^)]+)\)/);
        const cols = colMatch![1]!.split(",").map((c) => c.trim());
        const row: Record<string, unknown> = {};
        cols.forEach((c, i) => {
          row[c] = params![i];
        });
        rows.set(String(row.id), row);
        return [row] as T[];
      }
      if (text.includes("UPDATE agent_threads")) {
        const current = rows.get(String(params![0]));
        if (!current) return [] as T[];
        const setMatch = text.match(/SET\s+(.*?)\s+WHERE/is);
        const setClause = setMatch![1]!;
        const next: Record<string, unknown> = { ...current };
        for (const assignment of setClause.split(",")) {
          const m = assignment.trim().match(/^(\w+)\s*=\s*\$(\d+)/);
          if (!m) continue; // version = version + 1 — handled below
          next[m[1]!] = params![Number(m[2]) - 1];
        }
        next.version = Number(next.version ?? 1) + 1;
        next.updated_at = params![params!.length - 2];
        rows.set(String(next.id), next);
        return [next] as T[];
      }
      if (text.includes("SELECT * FROM agent_threads WHERE id")) {
        const row = rows.get(String(params![0]));
        return (row ? [row] : []) as T[];
      }
      return [] as T[];
    },
  };
  return { db, rows };
}

function record(lastTurnId: string | null): ThreadRecord {
  return {
    threadId: "thr_pg_1",
    ownerUserId: null,
    anonSessionTokenHash: "hash_1",
    version: 1,
    messages: [],
    lastTurnId,
    listingDraft: null,
    listingFlowState: null,
    searchContext: null,
    pendingConfirmations: [],
    currentIntent: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("PG last_turn_id persistence (pre-production blocker fix)", () => {
  it("create persists lastTurnId", async () => {
    const { db } = createPgSim();
    const store = new PostgresThreadStore(db);
    await store.create(record("turn-1"));
    const stored = await store.get("thr_pg_1");
    assert.equal(stored?.lastTurnId, "turn-1");
  });

  it("update overwrites lastTurnId", async () => {
    const { db } = createPgSim();
    const store = new PostgresThreadStore(db);
    await store.create(record("turn-1"));
    const updated = await store.update("thr_pg_1", (r) => ({ ...r, lastTurnId: "turn-2" }), {
      expectedVersion: 1,
    });
    assert.equal(updated.ok, true);
    assert.equal(updated.ok ? updated.record.lastTurnId : undefined, "turn-2");
    const stored = await store.get("thr_pg_1");
    assert.equal(stored?.lastTurnId, "turn-2");
  });

  it("read-back (rowToThread) returns the same value via get()", async () => {
    const { db } = createPgSim();
    const store = new PostgresThreadStore(db);
    await store.create(record("turn-9"));
    const stored = await store.get("thr_pg_1");
    assert.equal(stored?.lastTurnId, "turn-9");
  });

  it("null round-trips as NULL", async () => {
    const { db } = createPgSim();
    const store = new PostgresThreadStore(db);
    await store.create(record(null));
    assert.equal((await store.get("thr_pg_1"))?.lastTurnId, null);
    const updated = await store.update("thr_pg_1", (r) => ({ ...r, lastTurnId: null }), {
      expectedVersion: 1,
    });
    assert.equal(updated.ok, true);
    assert.equal((await store.get("thr_pg_1"))?.lastTurnId, null);
  });

  it("E1.5 idempotent-reservation fast-path can rely on the persisted lastTurnId", async () => {
    // The E1.5 loop reads `store.get(...).lastTurnId === turnKey` — this
    // proves the PG store round-trips the field the fast-path reads.
    const { db } = createPgSim();
    const store = new PostgresThreadStore(db);
    await store.create(record(null));
    const ok = await store.update("thr_pg_1", (r) => ({ ...r, lastTurnId: "turnKey-X" }), {
      expectedVersion: 1,
    });
    assert.equal(ok.ok, true);
    const current = await store.get("thr_pg_1");
    assert.equal(current?.lastTurnId, "turnKey-X");
    assert.equal(current!.lastTurnId === "turnKey-X", true);
  });
});
