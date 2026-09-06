/**
 * E1 — thread store instance wiring (swap seam like the user store).
 * Default: transitional in-memory adapter. Postgres adapter is PREPARED but
 * requires migration 066 (not applied) — operators wire it explicitly later.
 */
import {
  InMemoryThreadStore,
  PostgresThreadStore,
  type ThreadStore,
} from "./thread-store.js";
import { pool } from "../db.js";

let store: ThreadStore | null = null;

export function getThreadStore(): ThreadStore {
  if (!store) {
    if (process.env.AGENT_THREAD_STORE === "postgres") {
      store = new PostgresThreadStore({
        query: async <T extends import("pg").QueryResultRow>(
          text: string,
          params?: unknown[]
        ) => pool.query<T>(text, params).then((r) => r.rows),
      });
    } else {
      store = new InMemoryThreadStore();
    }
  }
  return store;
}

/** Test seam — replace the store for offline suites. */
export function setThreadStoreForTests(next: ThreadStore | null): void {
  store = next;
}
