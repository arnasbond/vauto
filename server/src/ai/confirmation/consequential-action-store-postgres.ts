/**
 * VAUTO AI Maturity — Phase 1: Consequential Action Confirmation Boundary.
 * Durable PostgreSQL-backed `PendingActionStore` (audit remediation #3).
 *
 * Durability rationale — Render topology (inspected 2026-08-28 via
 * render.yaml): `vauto-api` is a single Render web service (no `numInstances`
 * / autoscaling block), backed by a dedicated `vauto-db` PostgreSQL instance.
 * Every deploy restarts the process, which previously discarded ALL
 * in-memory pending actions (a proposal awaiting confirmation, or — worse —
 * an action that had just been claimed and was mid-execution). This store
 * persists the confirmation-boundary state machine in its own dedicated
 * table (`vauto_consequential_pending_actions`, migration
 * server/migrations/063_consequential_action_pending_1.0.sql), completely
 * separate from Stage 11 financial tables. This is intentionally the
 * smallest durable design: no triggers, no foreign keys into listings/
 * transactions, no generic workflow engine — just one CAS-guarded row per
 * pending action, following the exact pattern already used in production
 * for financial locks (see `PaymentRepository.tryAcquireTransferExecutionLock`
 * in server/src/payment/repository.ts).
 *
 * Every mutating method below is a SINGLE atomic SQL statement
 * (`UPDATE ... WHERE state = '<expected>' ... RETURNING *`). PostgreSQL row
 * locking during the UPDATE guarantees exactly one concurrent caller's
 * WHERE clause can match — this is what makes `tryClaim` / `tryCancel`
 * correct across concurrent requests on the SAME instance AND across
 * multiple instances (if this service is ever scaled out), not just
 * in-process.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  createWaiterRegistry,
  CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS,
  type CancelAttempt,
  type ClaimAttempt,
  type CompleteAttempt,
  type ConsequentialActionState,
  type ConsequentialActionType,
  type PendingActionStore,
  type PendingConsequentialAction,
} from "./consequential-action-policy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CONSEQUENTIAL_ACTION_MIGRATION_ID = "063_consequential_action_pending_1.0";
export const CONSEQUENTIAL_ACTION_MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../../migrations/063_consequential_action_pending_1.0.sql"),
  "utf8"
);

/** Minimal query surface — satisfied structurally by `pg.Pool` and by PGlite test adapters. */
export interface ConsequentialActionQueryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

type Row = {
  id: string;
  type: ConsequentialActionType;
  target_id: string;
  user_id: string;
  explanation: string;
  state: ConsequentialActionState;
  result_json: string | Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  executing_at: Date | string | null;
  execution_token: string | null;
};

function toMillis(v: Date | string): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

function parseResultJson(v: Row["result_json"]): unknown {
  if (v == null) return undefined;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  return v;
}

function mapRow(row: Row): PendingConsequentialAction {
  return {
    id: row.id,
    type: row.type,
    targetId: row.target_id,
    userId: row.user_id,
    explanation: row.explanation,
    createdAt: toMillis(row.created_at),
    expiresAt: toMillis(row.expires_at),
    executingAt: row.executing_at == null ? null : toMillis(row.executing_at),
    executionToken: row.execution_token,
    state: row.state,
    result: parseResultJson(row.result_json),
    errorMessage: row.error_message,
  };
}

export function createPostgresPendingActionStore(
  db: ConsequentialActionQueryable
): PendingActionStore {
  const waiters = createWaiterRegistry();

  return {
    waiters,

    async insert(action) {
      await db.query(
        `INSERT INTO vauto_consequential_pending_actions
           (id, type, target_id, user_id, explanation, state, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', to_timestamp($6::double precision / 1000.0), to_timestamp($7::double precision / 1000.0))`,
        [
          action.id,
          action.type,
          action.targetId,
          action.userId,
          action.explanation,
          action.createdAt,
          action.expiresAt,
        ]
      );
    },

    async get(id) {
      const res = await db.query<Row>(
        `SELECT * FROM vauto_consequential_pending_actions WHERE id = $1 LIMIT 1`,
        [id]
      );
      return res.rows[0] ? mapRow(res.rows[0]) : undefined;
    },

    async tryClaim(id, now): Promise<ClaimAttempt> {
      // Single atomic CAS covers BOTH cases: a fresh PENDING claim, and a
      // crash-recovery reclaim of a STALE EXECUTING row (executing_at older
      // than the lease). PostgreSQL's row-level locking during the UPDATE
      // guarantees only one concurrent caller's WHERE clause can match
      // either branch, so a fresh EXECUTING lease is never stolen and a
      // stale one has exactly one recovery winner — same guarantee, same
      // mechanism, as the original PENDING -> EXECUTING claim.
      //
      // Fencing: a brand-new opaque token is minted (in JS, not SQL — no
      // pgcrypto/uuid-ossp extension dependency) and written on EVERY match
      // of this UPDATE, so a stale-lease reclaim always invalidates the
      // token the previous (possibly still slowly running) executor holds.
      const newToken = randomUUID();
      const claim = await db.query<Row>(
        `UPDATE vauto_consequential_pending_actions
         SET state = 'EXECUTING', executing_at = to_timestamp($2::double precision / 1000.0),
             execution_token = $4
         WHERE id = $1
           AND (
             (state = 'PENDING' AND expires_at > to_timestamp($2::double precision / 1000.0))
             OR (state = 'EXECUTING' AND executing_at < to_timestamp(($2::double precision - $3::double precision) / 1000.0))
           )
         RETURNING *`,
        [id, now, CONSEQUENTIAL_ACTION_EXECUTION_LEASE_MS, newToken]
      );
      if (claim.rows[0]) {
        waiters.create(id);
        return { claimed: true, action: mapRow(claim.rows[0]) };
      }

      // Not claimed — attempt the PENDING -> EXPIRED transition atomically
      // (covers "PENDING but past TTL"); a no-op UPDATE if some other CAS
      // already moved the row out of PENDING first.
      const expire = await db.query<Row>(
        `UPDATE vauto_consequential_pending_actions
         SET state = 'EXPIRED', terminal_at = to_timestamp($2::double precision / 1000.0)
         WHERE id = $1 AND state = 'PENDING' AND expires_at <= to_timestamp($2::double precision / 1000.0)
         RETURNING *`,
        [id, now]
      );
      if (expire.rows[0]) return { claimed: false, action: mapRow(expire.rows[0]) };

      const current = await db.query<Row>(
        `SELECT * FROM vauto_consequential_pending_actions WHERE id = $1 LIMIT 1`,
        [id]
      );
      return { claimed: false, action: current.rows[0] ? mapRow(current.rows[0]) : undefined };
    },

    async complete(id, executionToken, outcome): Promise<CompleteAttempt> {
      const resultJson =
        outcome.state === "SUCCEEDED" ? JSON.stringify(outcome.result ?? null) : null;
      const errorMessage = outcome.state === "FAILED" ? outcome.errorMessage : null;
      // Fencing: the WHERE clause requires the EXACT current token. If the
      // lease was reclaimed since this caller's `tryClaim`, `execution_token`
      // no longer matches — this UPDATE matches zero rows (never a write),
      // regardless of `outcome`. This is the same single-statement CAS
      // pattern as `tryClaim`, so the guarantee is symmetric: exactly one
      // token can ever complete a given EXECUTING period.
      const res = await db.query<Row>(
        `UPDATE vauto_consequential_pending_actions
         SET state = $2, result_json = $3::jsonb, error_message = $4, terminal_at = NOW()
         WHERE id = $1 AND state = 'EXECUTING' AND execution_token = $5
         RETURNING *`,
        [id, outcome.state, resultJson, errorMessage, executionToken]
      );
      if (res.rows[0]) {
        const finalRow = mapRow(res.rows[0]);
        waiters.settle(id, finalRow);
        return { written: true, action: finalRow };
      }
      const current = await db.query<Row>(
        `SELECT * FROM vauto_consequential_pending_actions WHERE id = $1 LIMIT 1`,
        [id]
      );
      return { written: false, action: current.rows[0] ? mapRow(current.rows[0]) : undefined };
    },

    async tryCancel(id, now): Promise<CancelAttempt> {
      const cancel = await db.query<Row>(
        `UPDATE vauto_consequential_pending_actions
         SET state = 'CANCELLED', terminal_at = to_timestamp($2::double precision / 1000.0)
         WHERE id = $1 AND state = 'PENDING'
         RETURNING *`,
        [id, now]
      );
      if (cancel.rows[0]) return { cancelled: true, action: mapRow(cancel.rows[0]) };

      const current = await db.query<Row>(
        `SELECT * FROM vauto_consequential_pending_actions WHERE id = $1 LIMIT 1`,
        [id]
      );
      return { cancelled: false, action: current.rows[0] ? mapRow(current.rows[0]) : undefined };
    },
  };
}
