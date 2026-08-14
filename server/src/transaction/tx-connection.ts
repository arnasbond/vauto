/**
 * Single-connection transaction helpers for Stage 11 (PoolClient-safe).
 * Never use pool.query("BEGIN") — that can span multiple pool connections.
 */

import { pool, runInTransaction, type DbClient } from "../db.js";

/** Minimal queryable shape (avoids circular import with repository.ts). */
export type Queryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
  runInTransaction?: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
};

export function wrapClientAsQueryable(
  client: Pick<DbClient, "query">
): Queryable {
  return {
    async query(text, params = []) {
      const res = await client.query(text, params as never[]);
      return {
        rows: (res.rows ?? []) as never[],
        rowCount: res.rowCount ?? null,
      };
    },
  };
}

/** Serialize BEGIN/COMMIT on single-connection adapters (PGlite). */
const singleConnTxChains = new WeakMap<object, Promise<unknown>>();

/**
 * Run `fn` inside one atomic TX on a single connection.
 * - If `db.runInTransaction` is provided (production Pool adapter) → pool.connect()
 * - Else (PGlite / single-connection) → BEGIN/COMMIT on the same queryable (serialized)
 */
export async function runQueryableTransaction<T>(
  db: Queryable,
  fn: (tx: Queryable) => Promise<T>
): Promise<T> {
  if (typeof db.runInTransaction === "function") {
    return db.runInTransaction(fn);
  }
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const key = db as object;
  const prev = singleConnTxChains.get(key) ?? Promise.resolve();
  singleConnTxChains.set(
    key,
    prev.then(() => gate)
  );
  await prev.catch(() => {});
  try {
    await db.query("BEGIN");
    try {
      const result = await fn(db);
      await db.query("COMMIT");
      return result;
    } catch (e) {
      try {
        await db.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    }
  } finally {
    release();
  }
}

/** Bind any `pg.Pool` (e.g. test pool with max >= 4) as a Stage-11 queryable. */
export function createPoolTxQueryableFromPool(
  pgPool: Pick<typeof pool, "query" | "connect">
): Queryable {
  return {
    async query(text, params = []) {
      const res = await pgPool.query(text, params);
      return { rows: res.rows as never[], rowCount: res.rowCount };
    },
    runInTransaction: async <T>(fn: (tx: Queryable) => Promise<T>) => {
      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrapClientAsQueryable(client));
        await client.query("COMMIT");
        return result;
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

/**
 * Test harness only (Stage 12A Playwright / PGlite). Production stays on `pool`.
 * Never set this in a live NODE_ENV=production process.
 */
let txQueryableOverride: Queryable | null = null;

export function setTxQueryableOverride(q: Queryable | null): void {
  txQueryableOverride = q;
}

/** Production adapter: reads use global pool; writes in TX use reserved PoolClient. */
export function createPoolTxQueryable(): Queryable {
  if (txQueryableOverride) return txQueryableOverride;
  return createPoolTxQueryableFromPool(pool);
}
