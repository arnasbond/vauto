/**
 * Durable AI Watch outbox — listing events survive process crash.
 * Stage 10L: optional TX client enqueue + stale processing lease recovery (>5 min).
 */

import { randomUUID } from "node:crypto";
import { pool, query, type DbClient } from "../db.js";
import {
  getAiWatchRepository,
} from "./ai-watch-repository.js";
import { processWatchEvent } from "./watch-engine.js";
import type { WatchListingEvent } from "./types.js";

export type OutboxStatus = "pending" | "processing" | "done" | "failed";

const STALE_PROCESSING_INTERVAL = "5 minutes";

export type EnqueueAiWatchOutboxOpts = {
  /** When set, INSERT uses this client (same TX as listing write). */
  client?: DbClient;
  /** Default true. Set false when caller kicks worker after COMMIT. */
  kickWorker?: boolean;
};

/**
 * Persist watch event in outbox (durable).
 * Prefer same-transaction client when co-writing with listing INSERT/UPDATE.
 */
export async function enqueueAiWatchOutbox(
  event: WatchListingEvent,
  opts?: EnqueueAiWatchOutboxOpts
): Promise<string> {
  const id = randomUUID();
  const sql = `INSERT INTO ai_watch_outbox (
       id, event_type, listing_id, payload, status, attempts, available_at, created_at
     ) VALUES ($1,$2,$3,$4::jsonb,'pending',0,NOW(),NOW())`;
  const params = [id, event.eventType, event.listingId, JSON.stringify(event)];
  if (opts?.client) {
    await opts.client.query(sql, params);
  } else {
    await query(sql, params);
  }
  if (opts?.kickWorker !== false) {
    void processAiWatchOutboxBatch().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ai-watch-outbox] drain failed:", msg.slice(0, 400));
    });
  }
  return id;
}

/** Kick processor after an atomic listing+outbox COMMIT. */
export function kickAiWatchOutboxWorker(): void {
  void processAiWatchOutboxBatch().catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ai-watch-outbox] drain failed:", msg.slice(0, 400));
  });
}

/**
 * Reclaim jobs stuck in processing longer than 5 minutes.
 */
async function recoverStaleProcessingJobs(client: DbClient): Promise<number> {
  const res = await client.query(
    `UPDATE ai_watch_outbox
     SET status = 'pending',
         processing_since = NULL,
         available_at = NOW(),
         last_error = COALESCE(last_error, 'stale_processing_recovered')
     WHERE status = 'processing'
       AND (
         processing_since < NOW() - ($1::text)::interval
         OR (
           processing_since IS NULL
           AND available_at < NOW() - ($1::text)::interval
         )
       )`,
    [STALE_PROCESSING_INTERVAL]
  );
  return res.rowCount ?? 0;
}

/**
 * Claim + process a batch of pending outbox rows (FOR UPDATE SKIP LOCKED).
 * Recovers stale `processing` rows (>5 min) before claim.
 */
export async function processAiWatchOutboxBatch(
  limit = 20
): Promise<{ processed: number; failed: number; recovered: number }> {
  const client = await pool.connect();
  let processed = 0;
  let failed = 0;
  let recovered = 0;
  try {
    await client.query("BEGIN");
    recovered = await recoverStaleProcessingJobs(client);
    const claim = await client.query<{
      id: string;
      payload: WatchListingEvent | string;
      attempts: number;
    }>(
      `SELECT id, payload, attempts
       FROM ai_watch_outbox
       WHERE status = 'pending' AND available_at <= NOW()
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );

    for (const row of claim.rows) {
      await client.query(
        `UPDATE ai_watch_outbox
         SET status = 'processing',
             attempts = attempts + 1,
             processing_since = NOW(),
             available_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
    }
    await client.query("COMMIT");

    const repo = getAiWatchRepository();
    for (const row of claim.rows) {
      try {
        const payload =
          typeof row.payload === "string"
            ? (JSON.parse(row.payload) as WatchListingEvent)
            : row.payload;
        await processWatchEvent(repo, payload);
        await query(
          `UPDATE ai_watch_outbox
           SET status = 'done',
               last_error = NULL,
               processed_at = NOW(),
               processing_since = NULL
           WHERE id = $1`,
          [row.id]
        );
        processed += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : String(e);
        const attempts = Number(row.attempts ?? 0) + 1;
        const backoffSec = Math.min(3600, 5 * Math.pow(2, Math.min(attempts, 8)));
        await query(
          `UPDATE ai_watch_outbox
           SET status = $2,
               last_error = $3,
               processing_since = NULL,
               available_at = NOW() + ($4 || ' seconds')::interval
           WHERE id = $1`,
          [
            row.id,
            attempts >= 12 ? "failed" : "pending",
            msg.slice(0, 500),
            String(backoffSec),
          ]
        );
      }
    }
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
  return { processed, failed, recovered };
}

let workerTimer: ReturnType<typeof setInterval> | null = null;

/** Start periodic outbox worker (idempotent). */
export function startAiWatchOutboxWorker(intervalMs = 5000): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void processAiWatchOutboxBatch().catch(() => {});
  }, intervalMs);
  if (typeof workerTimer === "object" && "unref" in workerTimer) {
    workerTimer.unref();
  }
}

export function stopAiWatchOutboxWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
