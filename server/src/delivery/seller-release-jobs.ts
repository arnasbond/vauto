/**
 * Stage 11G.3/11G.4 — Durable seller_release_jobs outbox.
 * 11G.4: stale PROCESSING lease reclaim (>5 min) + max 12 attempts → FAILED.
 */

import { randomUUID } from "node:crypto";
import type { TxQueryable } from "../transaction/index.js";
import { DELIVERY_INTEGRATION_VERSION } from "./version.js";
import type { ReleaseFundsPort } from "./types.js";

/** After this many failed attempts the job requires MANUAL_REVIEW (FAILED). */
export const MAX_SELLER_RELEASE_ATTEMPTS = 12;

/** PROCESSING older than this is treated as a dead lease and reclaimed. */
export const STALE_PROCESSING_LEASE_MS = 5 * 60 * 1000;

export type SellerReleaseJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type SellerReleaseJob = {
  id: string;
  transactionId: string;
  actorUserId: string;
  idempotencyKey: string;
  status: SellerReleaseJobStatus;
  attempts: number;
  availableAt: string;
  lastError: string | null;
  transferStatus: string | null;
  processingStartedAt: string | null;
};

type JobRow = {
  id: string;
  transaction_id: string;
  actor_user_id: string;
  idempotency_key: string;
  status: string;
  attempts: number | string;
  available_at: string | Date;
  last_error: string | null;
  transfer_status: string | null;
  processing_started_at?: string | Date | null;
};

function mapJob(r: JobRow): SellerReleaseJob {
  const started = r.processing_started_at ?? null;
  return {
    id: r.id,
    transactionId: r.transaction_id,
    actorUserId: r.actor_user_id,
    idempotencyKey: r.idempotency_key,
    status: r.status as SellerReleaseJobStatus,
    attempts: Number(r.attempts),
    availableAt:
      typeof r.available_at === "string"
        ? r.available_at
        : r.available_at.toISOString(),
    lastError: r.last_error,
    transferStatus: r.transfer_status,
    processingStartedAt:
      started == null
        ? null
        : typeof started === "string"
          ? started
          : started.toISOString(),
  };
}

export function releaseBackoffSeconds(attemptsAfterFail: number): number {
  return Math.min(
    3600,
    2 * Math.pow(2, Math.min(Math.max(attemptsAfterFail, 1), 10))
  );
}

export class SellerReleaseJobRepository {
  constructor(private readonly db: TxQueryable) {}

  async getByTransactionId(
    transactionId: string
  ): Promise<SellerReleaseJob | null> {
    const res = await this.db.query<JobRow>(
      `SELECT * FROM seller_release_jobs WHERE transaction_id = $1 LIMIT 1`,
      [transactionId]
    );
    return res.rows[0] ? mapJob(res.rows[0]) : null;
  }

  /**
   * Insert PENDING job in the same TX as DELIVERED transition.
   * Idempotent if a job already exists for the transaction.
   * Never demotes COMPLETED or FAILED (FAILED = MANUAL_REVIEW).
   */
  async ensurePendingInTx(input: {
    transactionId: string;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<SellerReleaseJob> {
    const id = `srj_${randomUUID().replace(/-/g, "")}`;
    const res = await this.db.query<JobRow>(
      `INSERT INTO seller_release_jobs (
         id, transaction_id, actor_user_id, idempotency_key, status,
         attempts, available_at, delivery_integration_version
       ) VALUES ($1,$2,$3,$4,'PENDING',0,NOW(),$5)
       ON CONFLICT (transaction_id) DO UPDATE SET
         updated_at = NOW(),
         actor_user_id = COALESCE(seller_release_jobs.actor_user_id, EXCLUDED.actor_user_id),
         status = CASE
           WHEN seller_release_jobs.status IN ('COMPLETED', 'FAILED')
             THEN seller_release_jobs.status
           ELSE seller_release_jobs.status
         END,
         available_at = CASE
           WHEN seller_release_jobs.status IN ('COMPLETED', 'FAILED')
             THEN seller_release_jobs.available_at
           ELSE seller_release_jobs.available_at
         END
       RETURNING *`,
      [
        id,
        input.transactionId,
        input.actorUserId,
        input.idempotencyKey,
        DELIVERY_INTEGRATION_VERSION,
      ]
    );
    return mapJob(res.rows[0]!);
  }

  async markCompleted(
    id: string,
    transferStatus: string | null
  ): Promise<void> {
    await this.db.query(
      `UPDATE seller_release_jobs
       SET status = 'COMPLETED',
           transfer_status = $2,
           last_error = NULL,
           processing_started_at = NULL,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [id, transferStatus]
    );
  }

  async markFailed(
    id: string,
    attempts: number,
    lastError: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE seller_release_jobs
       SET status = 'FAILED',
           attempts = $2,
           last_error = $3,
           processing_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id, attempts, lastError.slice(0, 500)]
    );
  }

  /**
   * Retry with backoff, or FAILED after MAX_SELLER_RELEASE_ATTEMPTS.
   */
  async markRetry(
    id: string,
    attempts: number,
    lastError: string
  ): Promise<"PENDING" | "FAILED"> {
    if (attempts >= MAX_SELLER_RELEASE_ATTEMPTS) {
      await this.markFailed(id, attempts, lastError);
      console.error(
        `[seller-release-worker] CRITICAL MANUAL_REVIEW job=${id} attempts=${attempts} error=${lastError.slice(0, 200)}`
      );
      return "FAILED";
    }
    const backoff = releaseBackoffSeconds(attempts);
    const availableAt = new Date(Date.now() + backoff * 1000).toISOString();
    await this.db.query(
      `UPDATE seller_release_jobs
       SET status = 'PENDING',
           attempts = $2,
           last_error = $3,
           available_at = $4::timestamptz,
           processing_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id, attempts, lastError.slice(0, 500), availableAt]
    );
    return "PENDING";
  }

  /** Test helper — make job immediately available (not for FAILED/COMPLETED). */
  async forceAvailableNow(id: string): Promise<void> {
    await this.db.query(
      `UPDATE seller_release_jobs
       SET available_at = NOW() - INTERVAL '1 second',
           status = 'PENDING',
           processing_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND status NOT IN ('COMPLETED', 'FAILED')`,
      [id]
    );
  }

  /**
   * Reclaim PROCESSING rows whose lease is older than 5 minutes (crash recovery).
   */
  async reclaimStaleProcessing(): Promise<number> {
    const cutoff = new Date(
      Date.now() - STALE_PROCESSING_LEASE_MS
    ).toISOString();
    const res = await this.db.query(
      `UPDATE seller_release_jobs
       SET status = 'PENDING',
           processing_started_at = NULL,
           available_at = NOW(),
           last_error = COALESCE(last_error, 'stale_processing_reclaimed'),
           updated_at = NOW()
       WHERE status = 'PROCESSING'
         AND (
           (processing_started_at IS NOT NULL AND processing_started_at < $1::timestamptz)
           OR (processing_started_at IS NULL AND updated_at < $1::timestamptz)
         )`,
      [cutoff]
    );
    return res.rowCount ?? 0;
  }
}

/**
 * Process due release jobs (stale reclaim → claim → release / retry / FAILED).
 */
export async function processSellerReleaseJobs(
  db: TxQueryable,
  releasePort: ReleaseFundsPort | null,
  opts?: { limit?: number; forceImmediate?: boolean }
): Promise<{
  processed: number;
  completed: number;
  retried: number;
  failed: number;
  reclaimed: number;
}> {
  if (!releasePort) {
    return {
      processed: 0,
      completed: 0,
      retried: 0,
      failed: 0,
      reclaimed: 0,
    };
  }
  const limit = opts?.limit ?? 20;
  const repo = new SellerReleaseJobRepository(db);

  const reclaimed = await repo.reclaimStaleProcessing();

  if (opts?.forceImmediate) {
    await db.query(
      `UPDATE seller_release_jobs
       SET available_at = NOW() - INTERVAL '1 second'
       WHERE status = 'PENDING'`
    );
  }

  const due = await db.query<JobRow>(
    `SELECT * FROM seller_release_jobs
     WHERE status = 'PENDING' AND available_at <= NOW()
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  let completed = 0;
  let retried = 0;
  let failed = 0;
  let processed = 0;

  for (const row of due.rows) {
    // 11H.1 — never payout while transaction is DISPUTED or funds TRANSFER_BLOCKED by dispute.
    try {
      const gate = await db.query<{
        status: string;
        transfer_status: string | null;
      }>(
        `SELECT t.status,
                (SELECT transfer_status FROM vauto_payment_intents p
                 WHERE p.transaction_id = t.id LIMIT 1) AS transfer_status
         FROM vauto_transactions t
         WHERE t.id = $1`,
        [row.transaction_id]
      );
      const g = gate.rows[0];
      if (
        g?.status === "DISPUTED" ||
        g?.transfer_status === "TRANSFER_BLOCKED" ||
        g?.transfer_status === "TRANSFER_EXECUTING"
      ) {
        await repo.markFailed(
          row.id,
          Number(row.attempts),
          "dispute_or_transfer_blocked"
        );
        failed += 1;
        processed += 1;
        continue;
      }
    } catch {
      // continue if gate query unavailable
    }

    const claim = await db.query<JobRow>(
      `UPDATE seller_release_jobs
       SET status = 'PROCESSING',
           processing_started_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING *`,
      [row.id]
    );
    if (!claim.rows[0]) continue;
    processed += 1;
    const job = mapJob(claim.rows[0]);
    try {
      const res = await releasePort.releaseToSeller({
        transactionId: job.transactionId,
        actorUserId: job.actorUserId,
        body: { idempotencyKey: job.idempotencyKey },
      });
      await repo.markCompleted(job.id, res.transferStatus);
      completed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = job.attempts + 1;
      const outcome = await repo.markRetry(job.id, attempts, msg);
      if (outcome === "FAILED") failed += 1;
      else retried += 1;
    }
  }

  return { processed, completed, retried, failed, reclaimed };
}

let releaseWorkerStarted = false;
let releaseWorkerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Production boot: pass `{ db, releasePort }` so the worker is explicitly wired.
 */
export function startScheduledSellerReleaseWorker(opts?: {
  intervalMs?: number;
  db?: TxQueryable;
  releasePort?: ReleaseFundsPort;
  createDb?: () => TxQueryable;
  createReleasePort?: (db: TxQueryable) => ReleaseFundsPort;
}): void {
  if (releaseWorkerStarted) return;
  releaseWorkerStarted = true;
  const intervalMs = Math.min(
    Math.max(opts?.intervalMs ?? 15_000, 5_000),
    300_000
  );

  const tick = async () => {
    try {
      let db = opts?.db;
      let port = opts?.releasePort;
      if (!db) {
        if (opts?.createDb) {
          db = opts.createDb();
        } else {
          const { createPoolTxQueryable } = await import(
            "../transaction/index.js"
          );
          db = createPoolTxQueryable() as unknown as TxQueryable;
        }
      }
      if (!port) {
        if (opts?.createReleasePort) {
          port = opts.createReleasePort(db);
        } else {
          const { createFundsReleasePort } = await import(
            "./funds-release-port.js"
          );
          port = createFundsReleasePort(db);
        }
      }
      await processSellerReleaseJobs(db, port, { limit: 25 });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`[seller-release-worker] tick failed: ${detail}`);
    }
  };

  setTimeout(() => {
    void tick();
    releaseWorkerTimer = setInterval(() => void tick(), intervalMs);
    if (
      releaseWorkerTimer &&
      typeof releaseWorkerTimer === "object" &&
      "unref" in releaseWorkerTimer
    ) {
      (releaseWorkerTimer as NodeJS.Timeout).unref();
    }
  }, Math.min(5_000, intervalMs));
}

export function stopScheduledSellerReleaseWorkerForTests(): void {
  if (releaseWorkerTimer) clearInterval(releaseWorkerTimer);
  releaseWorkerTimer = null;
  releaseWorkerStarted = false;
}
