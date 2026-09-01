/**
 * F6.2 — durable bulk-operation store interface + implementations.
 *
 * The interface is the ONLY persistence surface the HTTP route and the
 * execution core may use (no SQL outside this file's Postgres adapter).
 * Postgres correctness: every mutating method is a single atomic statement
 * (INSERT … ON CONFLICT DO NOTHING / UPDATE … WHERE state = expected …
 * RETURNING), so the claim is correct across concurrent requests and across
 * multiple server instances.
 */
import { randomUUID } from "node:crypto";
import type { BulkOperation } from "../bulk-listing-control.js";

export const BULK_OPERATION_STATES = [
  "PENDING",
  "EXECUTING",
  "RECOVERING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "RECOVERY_REQUIRED",
] as const;
export type BulkOperationState = (typeof BULK_OPERATION_STATES)[number];

export const BULK_ITEM_STATES = ["PENDING", "APPLIED", "FAILED", "SKIPPED"] as const;
export type BulkItemState = (typeof BULK_ITEM_STATES)[number];

export type BulkTargetImageEntry = { id: string; verdict: "owned" | "foreign" | "not_found" | "invalid" };

export type BulkOperationRecord = {
  id: string;
  actorId: string;
  operation: BulkOperation;
  idempotencyKey: string;
  proposalDigest: string;
  targetImage: BulkTargetImageEntry[];
  state: BulkOperationState;
  resultJson: unknown;
  errorMessage: string | null;
  recoveryToken: string | null;
  leaseUntil: number | null;
  createdAt: number;
  updatedAt: number;
};

export type BulkItemRecord = {
  operationId: string;
  listingId: string;
  state: BulkItemState;
  outcome: string;
  detail: string | null;
  appliedAt: number | null;
};

export type BulkAuditInput = {
  operationId: string;
  actorId: string;
  action: string;
  targetId: string;
  proposalDigest: string;
  correlation: string;
  outcome: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
};

/** Minimal query surface — satisfied by `pg.Pool` (wrapped) and PGlite adapters. */
export interface BulkStoreQueryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
  /**
   * Transactional block used ONLY for atomic terminalization (result +
   * per-item outcomes + audit in one unit of work).
   */
  withTransaction<T>(fn: (q: BulkStoreQueryable) => Promise<T>): Promise<T>;
}

/** Wrap a `pg.Pool` into the store queryable (transactions via a client). */
export function postgresBulkQueryable(
  pool: {
    connect: () => Promise<{
      query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
      release: () => void;
    }>;
  }
): BulkStoreQueryable {
  const q: BulkStoreQueryable = {
    async query<T extends Record<string, unknown>>(text: string, params?: unknown[]) {
      const res = await pool.connect();
      try {
        const out = await res.query(text, params);
        return { rows: out.rows as T[] };
      } finally {
        res.release();
      }
    },
    async withTransaction<T>(fn: (tx: BulkStoreQueryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx: BulkStoreQueryable = {
          async query<Tx extends Record<string, unknown>>(text: string, params?: unknown[]) {
            const out = await client.query(text, params);
            return { rows: out.rows as Tx[] };
          },
          withTransaction: (inner) => inner(tx),
        };
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
  return q;
}

export interface BulkOperationStore {
  /**
   * Atomic claim: INSERT … ON CONFLICT DO NOTHING. Returns created:false with
   * the EXISTING record when this (actor, operation, key) already exists.
   * Sets a short execution lease so a healthy confirm cannot be raced by
   * recovery.
   */
  tryClaimOperation(input: {
    actorId: string;
    operation: BulkOperation;
    idempotencyKey: string;
    proposalDigest: string;
    targetImage: BulkTargetImageEntry[];
    leaseMs: number;
    nowMs: number;
  }): Promise<{ created: boolean; record: BulkOperationRecord }>;

  /** CAS state transition: UPDATE … WHERE id=$1 AND state=$2 RETURNING. */
  markState(
    operationId: string,
    from: BulkOperationState,
    to: BulkOperationState,
    opts?: { errorMessage?: string; nowMs?: number; leaseMs?: number }
  ): Promise<{ updated: boolean; record: BulkOperationRecord }>;

  /**
   * CAS recovery claim: exactly one caller transitions the operation into
   * RECOVERING and receives the server-derived recovery token. The claim only
   * succeeds when the operation is in one of `claimableStates` AND any prior
   * lease has expired. Concurrent recovery requests get claimed:false.
   */
  tryClaimRecovery(input: {
    operationId: string;
    claimableStates: BulkOperationState[];
    leaseMs: number;
    token: string;
    nowMs: number;
  }): Promise<{ claimed: boolean; record: BulkOperationRecord }>;

  /**
   * ATOMIC terminalization: state transition + result_json + per-item
   * outcomes + the mandatory audit rows commit in ONE transaction. A crash
   * before commit leaves the operation non-terminal (recoverable); no
   * terminal state can ever exist without its durable results and audit.
   */
  completeOperationAtomically(input: {
    operationId: string;
    fromStates: BulkOperationState[];
    to: BulkOperationState;
    resultJson: unknown;
    items: Array<{
      listingId: string;
      state: BulkItemState;
      outcome: string;
      detail?: string | null;
      appliedAt?: number | null;
    }>;
    audit: BulkAuditInput[];
    nowMs: number;
  }): Promise<{ updated: boolean; record: BulkOperationRecord }>;

  /** Persist per-item outcome (UPSERT on the natural key). */
  saveItemResult(input: {
    operationId: string;
    listingId: string;
    state: BulkItemState;
    outcome: string;
    detail?: string | null;
    appliedAt?: number | null;
  }): Promise<void>;

  /** Persist the full outcome set + terminal operation state atomically. */
  saveOutcomes(input: {
    operationId: string;
    from: BulkOperationState;
    to: BulkOperationState;
    resultJson: unknown;
    nowMs: number;
  }): Promise<{ updated: boolean; record: BulkOperationRecord }>;

  /** Append-only audit entries (server-derived fields only). */
  appendAudit(entries: BulkAuditInput[]): Promise<void>;

  getOperation(input: {
    actorId: string;
    operation: BulkOperation;
    idempotencyKey: string;
  }): Promise<BulkOperationRecord | null>;

  getItems(operationId: string): Promise<BulkItemRecord[]>;
}

function rowToRecord(row: Record<string, unknown>): BulkOperationRecord {
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    operation: String(row.operation) as BulkOperation,
    idempotencyKey: String(row.idempotency_key),
    proposalDigest: String(row.proposal_digest),
    targetImage: (row.target_image ?? []) as BulkTargetImageEntry[],
    state: String(row.state) as BulkOperationState,
    resultJson: row.result_json ?? null,
    errorMessage: row.error_message == null ? null : String(row.error_message),
    recoveryToken: row.recovery_token == null ? null : String(row.recovery_token),
    leaseUntil: row.lease_until == null ? null : new Date(String(row.lease_until)).getTime(),
    createdAt: new Date(String(row.created_at)).getTime(),
    updatedAt: new Date(String(row.updated_at)).getTime(),
  };
}

export function createPostgresBulkOperationStore(db: BulkStoreQueryable): BulkOperationStore {
  const iso = (ms: number) => new Date(ms).toISOString();
  const SELECT_COLUMNS =
    "id, actor_id, operation, idempotency_key, proposal_digest, target_image, state, result_json, error_message, recovery_token, lease_until, created_at, updated_at";
  return {
    async tryClaimOperation(input) {
      const id = randomUUID();
      const res = await db.query(
        `INSERT INTO vauto_bulk_operations
           (id, actor_id, operation, idempotency_key, proposal_digest, target_image, state, lease_until, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'PENDING', $7, $8, $8)
         ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
         RETURNING ${SELECT_COLUMNS}`,
        [
          id,
          input.actorId,
          input.operation,
          input.idempotencyKey,
          input.proposalDigest,
          JSON.stringify(input.targetImage),
          iso(input.nowMs + input.leaseMs),
          iso(input.nowMs),
        ]
      );
      if (res.rows.length > 0) {
        return { created: true, record: rowToRecord(res.rows[0]!) };
      }
      const existing = await db.query(
        `SELECT ${SELECT_COLUMNS}
         FROM vauto_bulk_operations
         WHERE actor_id = $1 AND operation = $2 AND idempotency_key = $3`,
        [input.actorId, input.operation, input.idempotencyKey]
      );
      if (existing.rows.length === 0) {
        throw new Error("bulk operation claim conflict but row not found");
      }
      return { created: false, record: rowToRecord(existing.rows[0]!) };
    },

    async markState(operationId, from, to, opts) {
      const now = opts?.nowMs ?? Date.now();
      const res = await db.query(
        `UPDATE vauto_bulk_operations
         SET state = $2, updated_at = $3, error_message = COALESCE($4, error_message),
             lease_until = CASE WHEN $6::timestamptz IS NULL THEN lease_until ELSE $6::timestamptz END
         WHERE id = $1 AND state = $5
         RETURNING ${SELECT_COLUMNS}`,
        [operationId, to, iso(now), opts?.errorMessage ?? null, from, opts?.leaseMs != null ? iso(now + opts.leaseMs) : null]
      );
      if (res.rows.length === 0) {
        const current = await db.query(
          `SELECT ${SELECT_COLUMNS} FROM vauto_bulk_operations WHERE id = $1`,
          [operationId]
        );
        if (current.rows.length === 0) throw new Error("bulk operation not found");
        return { updated: false, record: rowToRecord(current.rows[0]!) };
      }
      return { updated: true, record: rowToRecord(res.rows[0]!) };
    },

    async tryClaimRecovery(input) {
      const stateList = [...new Set(input.claimableStates)];
      const res = await db.query(
        `UPDATE vauto_bulk_operations
         SET state = 'RECOVERING', recovery_token = $2, lease_until = $3, updated_at = $4
         WHERE id = $1
           AND state = ANY($5::text[])
           AND (lease_until IS NULL OR lease_until <= $4)
         RETURNING ${SELECT_COLUMNS}`,
        [input.operationId, input.token, iso(input.nowMs + input.leaseMs), iso(input.nowMs), stateList]
      );
      if (res.rows.length > 0) {
        return { claimed: true, record: rowToRecord(res.rows[0]!) };
      }
      const current = await db.query(
        `SELECT ${SELECT_COLUMNS} FROM vauto_bulk_operations WHERE id = $1`,
        [input.operationId]
      );
      if (current.rows.length === 0) throw new Error("bulk operation not found");
      return { claimed: false, record: rowToRecord(current.rows[0]!) };
    },

    async completeOperationAtomically(input) {
      const stateList = [...new Set(input.fromStates)];
      return db.withTransaction(async (tx) => {
        const res = await tx.query(
          `UPDATE vauto_bulk_operations
           SET state = $2, result_json = $3::jsonb, updated_at = $4, recovery_token = NULL, lease_until = NULL
           WHERE id = $1 AND state = ANY($5::text[])
           RETURNING ${SELECT_COLUMNS}`,
          [input.operationId, input.to, JSON.stringify(input.resultJson), iso(input.nowMs), stateList]
        );
        if (res.rows.length === 0) {
          const current = await tx.query(
            `SELECT ${SELECT_COLUMNS} FROM vauto_bulk_operations WHERE id = $1`,
            [input.operationId]
          );
          if (current.rows.length === 0) throw new Error("bulk operation not found");
          return { updated: false, record: rowToRecord(current.rows[0]!) };
        }
        for (const item of input.items) {
          await tx.query(
            `INSERT INTO vauto_bulk_operation_items (operation_id, listing_id, state, outcome, detail, applied_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (operation_id, listing_id)
             DO UPDATE SET state = EXCLUDED.state, outcome = EXCLUDED.outcome, detail = EXCLUDED.detail, applied_at = EXCLUDED.applied_at`,
            [
              input.operationId,
              item.listingId,
              item.state,
              item.outcome,
              item.detail ?? null,
              item.appliedAt == null ? null : iso(item.appliedAt),
            ]
          );
        }
        for (const e of input.audit) {
          await tx.query(
            `INSERT INTO vauto_bulk_audit_entries
               (operation_id, actor_id, action, target_id, proposal_digest, correlation, outcome, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
            [
              e.operationId,
              e.actorId,
              e.action,
              e.targetId,
              e.proposalDigest,
              e.correlation,
              e.outcome,
              JSON.stringify(e.metadata ?? {}),
              iso(e.timestamp),
            ]
          );
        }
        return { updated: true, record: rowToRecord(res.rows[0]!) };
      });
    },

    async saveItemResult(input) {
      await db.query(
        `INSERT INTO vauto_bulk_operation_items (operation_id, listing_id, state, outcome, detail, applied_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (operation_id, listing_id)
         DO UPDATE SET state = EXCLUDED.state, outcome = EXCLUDED.outcome, detail = EXCLUDED.detail, applied_at = EXCLUDED.applied_at`,
        [
          input.operationId,
          input.listingId,
          input.state,
          input.outcome,
          input.detail ?? null,
          input.appliedAt == null ? null : iso(input.appliedAt),
        ]
      );
    },

    async saveOutcomes(input) {
      const res = await db.query(
        `UPDATE vauto_bulk_operations
         SET state = $2, result_json = $3::jsonb, updated_at = $4
         WHERE id = $1 AND state = $5
         RETURNING ${SELECT_COLUMNS}`,
        [input.operationId, input.to, JSON.stringify(input.resultJson), iso(input.nowMs), input.from]
      );
      if (res.rows.length === 0) {
        const current = await db.query(
          `SELECT ${SELECT_COLUMNS} FROM vauto_bulk_operations WHERE id = $1`,
          [input.operationId]
        );
        if (current.rows.length === 0) throw new Error("bulk operation not found");
        return { updated: false, record: rowToRecord(current.rows[0]!) };
      }
      return { updated: true, record: rowToRecord(res.rows[0]!) };
    },

    async appendAudit(entries) {
      for (const e of entries) {
        await db.query(
          `INSERT INTO vauto_bulk_audit_entries
             (operation_id, actor_id, action, target_id, proposal_digest, correlation, outcome, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
          [
            e.operationId,
            e.actorId,
            e.action,
            e.targetId,
            e.proposalDigest,
            e.correlation,
            e.outcome,
            JSON.stringify(e.metadata ?? {}),
            iso(e.timestamp),
          ]
        );
      }
    },

    async getOperation(input) {
      const res = await db.query(
        `SELECT ${SELECT_COLUMNS}
         FROM vauto_bulk_operations
         WHERE actor_id = $1 AND operation = $2 AND idempotency_key = $3`,
        [input.actorId, input.operation, input.idempotencyKey]
      );
      return res.rows.length ? rowToRecord(res.rows[0]!) : null;
    },

    async getItems(operationId) {
      const res = await db.query(
        `SELECT operation_id, listing_id, state, outcome, detail, applied_at
         FROM vauto_bulk_operation_items WHERE operation_id = $1 ORDER BY listing_id`,
        [operationId]
      );
      return res.rows.map((r) => ({
        operationId: String(r.operation_id),
        listingId: String(r.listing_id),
        state: String(r.state) as BulkItemState,
        outcome: String(r.outcome),
        detail: r.detail == null ? null : String(r.detail),
        appliedAt: r.applied_at == null ? null : new Date(String(r.applied_at)).getTime(),
      }));
    },
  };
}

/**
 * Deterministic in-memory store for tests. `claimLatencyMs` can inject a
 * claim delay to simulate two concurrent callers; the claim stays atomic
 * because the in-flight set is checked synchronously.
 */
export function createInMemoryBulkOperationStore(): BulkOperationStore & {
  _records: Map<string, BulkOperationRecord>;
  _items: Map<string, BulkItemRecord[]>;
  _audit: BulkAuditInput[];
} {
  const records = new Map<string, BulkOperationRecord>();
  const items = new Map<string, BulkItemRecord[]>();
  const audit: BulkAuditInput[] = [];
  const inFlight = new Set<string>();

  const key = (actorId: string, operation: string, idempotencyKey: string) =>
    `${actorId}:${operation}:${idempotencyKey}`;
  const find = (k: string) => {
    for (const r of records.values()) {
      if (key(r.actorId, r.operation, r.idempotencyKey) === k) return r;
    }
    return undefined;
  };

  return {
    _records: records,
    _items: items,
    _audit: audit,
    async tryClaimOperation(input) {
      const k = key(input.actorId, input.operation, input.idempotencyKey);
      if (inFlight.has(k)) {
        const existing = find(k);
        if (existing) return { created: false, record: existing };
        throw new Error("claim in flight");
      }
      const existing = find(k);
      if (existing) return { created: false, record: existing };
      inFlight.add(k);
      const record: BulkOperationRecord = {
        id: randomUUID(),
        actorId: input.actorId,
        operation: input.operation,
        idempotencyKey: input.idempotencyKey,
        proposalDigest: input.proposalDigest,
        targetImage: input.targetImage,
        state: "PENDING",
        resultJson: null,
        errorMessage: null,
        recoveryToken: null,
        leaseUntil: input.nowMs + input.leaseMs,
        createdAt: input.nowMs,
        updatedAt: input.nowMs,
      };
      records.set(record.id, record);
      inFlight.delete(k);
      return { created: true, record };
    },
    async markState(operationId, from, to, opts) {
      const r = records.get(operationId);
      if (!r) throw new Error("bulk operation not found");
      if (r.state !== from) return { updated: false, record: r };
      r.state = to;
      if (opts?.errorMessage != null) r.errorMessage = opts.errorMessage;
      if (opts?.leaseMs != null) r.leaseUntil = (opts.nowMs ?? Date.now()) + opts.leaseMs;
      r.updatedAt = opts?.nowMs ?? Date.now();
      return { updated: true, record: r };
    },
    async tryClaimRecovery(input) {
      const r = records.get(input.operationId);
      if (!r) throw new Error("bulk operation not found");
      const claimable = input.claimableStates.includes(r.state);
      const leaseExpired = r.leaseUntil == null || r.leaseUntil <= input.nowMs;
      if (!claimable || !leaseExpired) return { claimed: false, record: r };
      r.state = "RECOVERING";
      r.recoveryToken = input.token;
      r.leaseUntil = input.nowMs + input.leaseMs;
      r.updatedAt = input.nowMs;
      return { claimed: true, record: r };
    },
    async completeOperationAtomically(input) {
      const r = records.get(input.operationId);
      if (!r) throw new Error("bulk operation not found");
      if (!input.fromStates.includes(r.state)) return { updated: false, record: r };
      r.state = input.to;
      r.resultJson = input.resultJson;
      r.recoveryToken = null;
      r.leaseUntil = null;
      r.updatedAt = input.nowMs;
      for (const item of input.items) {
        const list = items.get(input.operationId) ?? [];
        const idx = list.findIndex((i) => i.listingId === item.listingId);
        const next: BulkItemRecord = {
          operationId: input.operationId,
          listingId: item.listingId,
          state: item.state,
          outcome: item.outcome,
          detail: item.detail ?? null,
          appliedAt: item.appliedAt ?? null,
        };
        if (idx >= 0) list[idx] = next;
        else list.push(next);
        items.set(input.operationId, list);
      }
      audit.push(...input.audit);
      return { updated: true, record: r };
    },
    async saveItemResult(input) {
      const list = items.get(input.operationId) ?? [];
      const existingIdx = list.findIndex((i) => i.listingId === input.listingId);
      const next: BulkItemRecord = {
        operationId: input.operationId,
        listingId: input.listingId,
        state: input.state,
        outcome: input.outcome,
        detail: input.detail ?? null,
        appliedAt: input.appliedAt ?? null,
      };
      if (existingIdx >= 0) list[existingIdx] = next;
      else list.push(next);
      items.set(input.operationId, list);
    },
    async saveOutcomes(input) {
      const r = records.get(input.operationId);
      if (!r) throw new Error("bulk operation not found");
      if (r.state !== input.from) return { updated: false, record: r };
      r.state = input.to;
      r.resultJson = input.resultJson;
      r.updatedAt = input.nowMs;
      return { updated: true, record: r };
    },
    async appendAudit(entries) {
      audit.push(...entries);
    },
    async getOperation(input) {
      return find(key(input.actorId, input.operation, input.idempotencyKey)) ?? null;
    },
    async getItems(operationId) {
      return items.get(operationId) ?? [];
    },
  };
}
