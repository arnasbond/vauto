/**
 * Stage 11H.2 — Durable dispute_financial_jobs outbox (C-01).
 * Decision is recorded first; 11F execution retries until success or MANUAL_REVIEW.
 */

import { randomUUID } from "node:crypto";
import type { TxQueryable } from "../transaction/index.js";
import { TransactionRepository } from "../transaction/index.js";
import { PaymentRepository } from "../payment/index.js";
import type { DisputeFundsPort, DisputeResolution } from "./types.js";
import { DisputeRepository } from "./dispute-repository.js";
import { DISPUTE_ENGINE_VERSION } from "./version.js";

/** After this many failed attempts the job requires MANUAL_REVIEW. */
export const MAX_DISPUTE_FINANCIAL_ATTEMPTS = 12;

/** Short wait while seller transfer is still in-flight (11H.4 serialization). */
export const TRANSFER_FINALITY_WAIT_SECONDS = 3;

function isSellerTransferInFlight(status: string | null | undefined): boolean {
  return (
    status === "TRANSFER_PENDING" || status === "TRANSFER_EXECUTING"
  );
}

/** PROCESSING older than this is treated as a dead lease and reclaimed. */
export const STALE_DISPUTE_FINANCIAL_LEASE_MS = 5 * 60 * 1000;

export type DisputeFinancialJobStatus =
  | "FINANCIAL_ACTION_PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "MANUAL_REVIEW";

export type DisputeFinancialJob = {
  id: string;
  disputeId: string;
  transactionId: string;
  resolution: DisputeResolution;
  idempotencyKey: string;
  actorUserId: string;
  sellerId: string;
  buyerId: string;
  status: DisputeFinancialJobStatus;
  attempts: number;
  availableAt: string;
  lastError: string | null;
  transferStatus: string | null;
  processingStartedAt: string | null;
};

type JobRow = {
  id: string;
  dispute_id: string;
  transaction_id: string;
  resolution: string;
  idempotency_key: string;
  actor_user_id: string;
  seller_id: string;
  buyer_id: string;
  status: string;
  attempts: number | string;
  available_at: string | Date;
  last_error: string | null;
  transfer_status: string | null;
  processing_started_at?: string | Date | null;
};

function mapJob(r: JobRow): DisputeFinancialJob {
  const started = r.processing_started_at ?? null;
  return {
    id: r.id,
    disputeId: r.dispute_id,
    transactionId: r.transaction_id,
    resolution: r.resolution as DisputeResolution,
    idempotencyKey: r.idempotency_key,
    actorUserId: r.actor_user_id,
    sellerId: r.seller_id,
    buyerId: r.buyer_id,
    status: r.status as DisputeFinancialJobStatus,
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

export function disputeFinancialBackoffSeconds(
  attemptsAfterFail: number
): number {
  return Math.min(
    3600,
    2 * Math.pow(2, Math.min(Math.max(attemptsAfterFail, 1), 10))
  );
}

export class DisputeFinancialJobRepository {
  constructor(private readonly db: TxQueryable) {}

  async getByTransactionId(
    transactionId: string
  ): Promise<DisputeFinancialJob | null> {
    const res = await this.db.query<JobRow>(
      `SELECT * FROM dispute_financial_jobs WHERE transaction_id = $1 LIMIT 1`,
      [transactionId]
    );
    return res.rows[0] ? mapJob(res.rows[0]) : null;
  }

  async ensurePendingInTx(input: {
    disputeId: string;
    transactionId: string;
    resolution: DisputeResolution;
    idempotencyKey: string;
    actorUserId: string;
    sellerId: string;
    buyerId: string;
  }): Promise<DisputeFinancialJob> {
    const existing = await this.getByTransactionId(input.transactionId);
    if (existing) {
      if (
        existing.status === "COMPLETED" ||
        existing.status === "MANUAL_REVIEW" ||
        existing.status === "FAILED"
      ) {
        return existing;
      }
      return existing;
    }

    const id = `dfj_${randomUUID().replace(/-/g, "")}`;
    const res = await this.db.query<JobRow>(
      `INSERT INTO dispute_financial_jobs (
         id, dispute_id, transaction_id, resolution, idempotency_key,
         actor_user_id, seller_id, buyer_id, status, dispute_engine_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'FINANCIAL_ACTION_PENDING',$9)
       ON CONFLICT (transaction_id) DO NOTHING
       RETURNING *`,
      [
        id,
        input.disputeId,
        input.transactionId,
        input.resolution,
        input.idempotencyKey,
        input.actorUserId,
        input.sellerId,
        input.buyerId,
        DISPUTE_ENGINE_VERSION,
      ]
    );
    if (res.rows[0]) return mapJob(res.rows[0]);
    const again = await this.getByTransactionId(input.transactionId);
    if (!again) throw new Error("dispute_financial_job_insert_race");
    return again;
  }

  async markCompleted(
    id: string,
    transferStatus: string | null
  ): Promise<void> {
    await this.db.query(
      `UPDATE dispute_financial_jobs
       SET status = 'COMPLETED',
           transfer_status = $2,
           processing_started_at = NULL,
           completed_at = NOW(),
           updated_at = NOW(),
           last_error = NULL
       WHERE id = $1`,
      [id, transferStatus]
    );
  }

  async markRetry(
    id: string,
    attempts: number,
    lastError: string
  ): Promise<"FINANCIAL_ACTION_PENDING" | "MANUAL_REVIEW"> {
    if (attempts >= MAX_DISPUTE_FINANCIAL_ATTEMPTS) {
      await this.db.query(
        `UPDATE dispute_financial_jobs
         SET status = 'MANUAL_REVIEW',
             attempts = $2,
             last_error = $3,
             processing_started_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [id, attempts, lastError.slice(0, 2000)]
      );
      return "MANUAL_REVIEW";
    }
    const backoff = disputeFinancialBackoffSeconds(attempts);
    await this.db.query(
      `UPDATE dispute_financial_jobs
       SET status = 'FINANCIAL_ACTION_PENDING',
           attempts = $2,
           last_error = $3,
           available_at = NOW() + ($4 || ' seconds')::interval,
           processing_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id, attempts, lastError.slice(0, 2000), String(backoff)]
    );
    return "FINANCIAL_ACTION_PENDING";
  }

  /**
   * 11H.4 — recoverable wait for TRANSFER_EXECUTING finality.
   * Does not increment attempts (waiting is not a failure).
   */
  async markWaitForTransferFinality(
    id: string,
    lastError: string,
    backoffSeconds = TRANSFER_FINALITY_WAIT_SECONDS
  ): Promise<void> {
    await this.db.query(
      `UPDATE dispute_financial_jobs
       SET status = 'FINANCIAL_ACTION_PENDING',
           last_error = $2,
           available_at = NOW() + ($3 || ' seconds')::interval,
           processing_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND status NOT IN ('COMPLETED', 'MANUAL_REVIEW', 'FAILED')`,
      [id, lastError.slice(0, 2000), String(backoffSeconds)]
    );
  }

  async forceAvailableNow(id: string): Promise<void> {
    await this.db.query(
      `UPDATE dispute_financial_jobs
       SET available_at = NOW() - INTERVAL '1 second',
           status = 'FINANCIAL_ACTION_PENDING',
           processing_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND status NOT IN ('COMPLETED', 'MANUAL_REVIEW', 'FAILED')`,
      [id]
    );
  }

  async reclaimStaleProcessing(): Promise<number> {
    const cutoff = new Date(
      Date.now() - STALE_DISPUTE_FINANCIAL_LEASE_MS
    ).toISOString();
    const res = await this.db.query(
      `UPDATE dispute_financial_jobs
       SET status = 'FINANCIAL_ACTION_PENDING',
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
 * Apply durable 11F action after DECIDED_*, then SM → COMPLETED/CANCELLED + RESOLVED_*.
 */
export async function processDisputeFinancialJobs(
  db: TxQueryable,
  fundsPort: DisputeFundsPort | null,
  opts?: { limit?: number; forceImmediate?: boolean }
): Promise<{
  processed: number;
  completed: number;
  retried: number;
  manualReview: number;
  reclaimed: number;
}> {
  if (!fundsPort) {
    return {
      processed: 0,
      completed: 0,
      retried: 0,
      manualReview: 0,
      reclaimed: 0,
    };
  }
  const limit = opts?.limit ?? 20;
  const repo = new DisputeFinancialJobRepository(db);
  const reclaimed = await repo.reclaimStaleProcessing();

  if (opts?.forceImmediate) {
    await db.query(
      `UPDATE dispute_financial_jobs
       SET available_at = NOW() - INTERVAL '1 second'
       WHERE status = 'FINANCIAL_ACTION_PENDING'`
    );
  }

  const due = await db.query<JobRow>(
    `SELECT * FROM dispute_financial_jobs
     WHERE status = 'FINANCIAL_ACTION_PENDING' AND available_at <= NOW()
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  let completed = 0;
  let retried = 0;
  let manualReview = 0;
  let processed = 0;

  for (const row of due.rows) {
    const claim = await db.query<JobRow>(
      `UPDATE dispute_financial_jobs
       SET status = 'PROCESSING',
           processing_started_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'FINANCIAL_ACTION_PENDING'
       RETURNING *`,
      [row.id]
    );
    if (!claim.rows[0]) continue;
    processed += 1;
    const job = mapJob(claim.rows[0]);

    try {
      let transferStatus: string | null = null;
      if (job.resolution === "RESOLVE_BUYER_REFUND") {
        const intent = await new PaymentRepository(db).getByTransactionId(
          job.transactionId
        );
        if (isSellerTransferInFlight(intent?.transferStatus)) {
          await repo.markWaitForTransferFinality(
            job.id,
            `wait_transfer_finality:${intent?.transferStatus}`
          );
          retried += 1;
          continue;
        }
        const r = await fundsPort.refundToBuyer({
          transactionId: job.transactionId,
          actorUserId: job.actorUserId,
          body: { idempotencyKey: `dsp-refund-${job.idempotencyKey}` },
          authority: "DISPUTE_ENGINE",
        });
        transferStatus = r.transferStatus;
        if (r.transferStatus !== "REFUNDED") {
          throw new Error(`refund_not_confirmed:${r.transferStatus}`);
        }
      } else {
        const r = await fundsPort.releaseToSeller({
          transactionId: job.transactionId,
          actorUserId: job.sellerId,
          body: { idempotencyKey: `dsp-release-${job.idempotencyKey}` },
        });
        transferStatus = r.transferStatus;
        if (r.transferStatus !== "TRANSFERRED") {
          throw new Error(`release_not_confirmed:${r.transferStatus}`);
        }
      }

      // Financial confirmation → SM finality + dispute RESOLVED_*
      const { runQueryableTransaction } = await import(
        "../transaction/index.js"
      );
      await runQueryableTransaction(db, async (tx) => {
        const txRepo = new TransactionRepository(tx);
        const disputes = new DisputeRepository(tx);
        const txn = await txRepo.getById(job.transactionId);
        if (!txn) throw new Error("transaction_missing_on_financial_finalize");

        const isRefund = job.resolution === "RESOLVE_BUYER_REFUND";
        const targetStatus = isRefund ? "CANCELLED" : "COMPLETED";
        if (txn.status === "DISPUTED") {
          await txRepo.executeTransitionInTx(tx, {
            transactionId: txn.id,
            toStatus: targetStatus,
            actorType: "SYSTEM",
            actorId: "SYSTEM",
            reasonCode: isRefund
              ? "DISPUTE_RESOLVED_BUYER_REFUND"
              : "DISPUTE_RESOLVED_SELLER_PAYOUT",
            expectedVersion: txn.version,
            idempotencyKey: `dsp-fin-final-${job.idempotencyKey}`,
            metadata: {
              disputeFinancialJobId: job.id,
              transferStatus,
              disputeEngineVersion: DISPUTE_ENGINE_VERSION,
            },
          });
        } else if (
          txn.status !== "CANCELLED" &&
          txn.status !== "COMPLETED"
        ) {
          throw new Error(
            `unexpected_txn_status_on_financial_finalize:${txn.status}`
          );
        }

        const liveDispute = await disputes.getById(job.disputeId);
        if (!liveDispute) throw new Error("dispute_missing_on_financial_finalize");
        if (
          liveDispute.status === "DECIDED_BUYER_REFUND" ||
          liveDispute.status === "DECIDED_SELLER_PAYOUT"
        ) {
          await disputes.markFinanciallyResolved({
            id: job.disputeId,
            status: isRefund
              ? "RESOLVED_BUYER_REFUND"
              : "RESOLVED_SELLER_PAYOUT",
          });
        }
      });

      await repo.markCompleted(job.id, transferStatus);
      completed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/refund deferred until transfer finality/i.test(msg)) {
        await repo.markWaitForTransferFinality(job.id, msg);
        retried += 1;
        continue;
      }
      const attempts = job.attempts + 1;
      const outcome = await repo.markRetry(job.id, attempts, msg);
      if (outcome === "MANUAL_REVIEW") manualReview += 1;
      else retried += 1;
    }
  }

  return { processed, completed, retried, manualReview, reclaimed };
}

let disputeFinancialWorkerStarted = false;
let disputeFinancialWorkerTimer: ReturnType<typeof setInterval> | null = null;

/** Production boot: durable dispute financial finality worker. */
export function startScheduledDisputeFinancialWorker(opts?: {
  intervalMs?: number;
  db?: TxQueryable;
  fundsPort?: DisputeFundsPort;
  createDb?: () => TxQueryable;
  createFundsPort?: (db: TxQueryable) => DisputeFundsPort;
}): void {
  if (disputeFinancialWorkerStarted) return;
  disputeFinancialWorkerStarted = true;
  const intervalMs = Math.min(
    Math.max(opts?.intervalMs ?? 15_000, 5_000),
    300_000
  );

  const tick = async () => {
    try {
      let db = opts?.db;
      let port = opts?.fundsPort;
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
        if (opts?.createFundsPort) {
          port = opts.createFundsPort(db);
        } else {
          const { createDisputeFundsPort } = await import("./funds-port.js");
          port = createDisputeFundsPort(db);
        }
      }
      await processDisputeFinancialJobs(db, port, { limit: 25 });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`[dispute-financial-worker] tick failed: ${detail}`);
    }
  };

  setTimeout(() => {
    void tick();
    disputeFinancialWorkerTimer = setInterval(() => void tick(), intervalMs);
    if (
      disputeFinancialWorkerTimer &&
      typeof disputeFinancialWorkerTimer === "object" &&
      "unref" in disputeFinancialWorkerTimer
    ) {
      (disputeFinancialWorkerTimer as NodeJS.Timeout).unref();
    }
  }, Math.min(5_000, intervalMs));
}

export function stopScheduledDisputeFinancialWorkerForTests(): void {
  if (disputeFinancialWorkerTimer) clearInterval(disputeFinancialWorkerTimer);
  disputeFinancialWorkerTimer = null;
  disputeFinancialWorkerStarted = false;
}
