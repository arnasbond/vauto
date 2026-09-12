/**
 * E1 — thread store instance wiring (swap seam like the user store).
 *
 * Production: the durable PostgresThreadStore is installed by index.ts
 * (`markThreadStoreReady`) AFTER migrations succeed — exactly like the
 * confirmation boundary. In production there is NO in-memory fallback:
 * until the durable store is installed, getThreadStore() fails closed, so a
 * misconfigured production never silently pretends conversation state is
 * durable when it is not.
 *
 * Development / tests: the transitional in-memory adapter remains the default
 * (unit tests and isolated local dev do not require PostgreSQL).
 */
import {
  InMemoryThreadStore,
  PostgresThreadStore,
  type ThreadStore,
  type ThreadQueryable,
} from "./thread-store.js";
import { pool } from "../db.js";

let store: ThreadStore | null = null;

function isNodeProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Build a Postgres-backed thread store over the shared pool. */
export function createPostgresThreadStore(): ThreadStore {
  const db: ThreadQueryable = {
    query: async <T extends import("pg").QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<T[]> => {
      const res = await pool.query<T>(text, params);
      return res.rows;
    },
  };
  return new PostgresThreadStore(db);
}

/**
 * Install the durable Postgres store. Called ONLY by index.ts after
 * `runMigrations()` succeeds. Before this call, in production, the store is
 * intentionally NOT installed — getThreadStore() fails closed (never a
 * non-durable in-memory fallback).
 */
export function markThreadStoreReady(next: ThreadStore): void {
  store = next;
}

export function getThreadStore(): ThreadStore {
  if (store) return store;

  // Explicit operator override (any environment): durable Postgres.
  if (process.env.AGENT_THREAD_STORE === "postgres") {
    store = createPostgresThreadStore();
    return store;
  }

  // Production must never silently degrade to a non-durable in-memory store.
  if (isNodeProduction()) {
    throw new Error(
      "Thread store unavailable: durable conversation persistence is not initialized."
    );
  }

  // Development / test default (transitional in-memory adapter).
  store = new InMemoryThreadStore();
  return store;
}

/** Test seam — replace the store for offline suites. */
export function setThreadStoreForTests(next: ThreadStore | null): void {
  store = next;
}
