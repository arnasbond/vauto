/**
 * PostgreSQL repository — atomic transitions with optimistic locking + idempotency.
 * Injectable queryable for PGlite integration tests.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAuditRecord } from "./audit-logger.js";
import {
  CreateTransactionInputSchema,
  TransitionCommandSchema,
} from "./schema.js";
import {
  assertTransitionAllowed,
  computeIdempotencyFingerprint,
} from "./state-machine.js";
import {
  IdempotencyConflictError,
  TransactionNotFoundError,
  VersionConflictError,
  type ActorType,
  type ReasonCode,
  type TransactionEventRecord,
  type TransactionStatus,
  type TransitionCommand,
  type TransitionResult,
  type VautoTransaction,
} from "./types.js";
import { TRANSACTION_STATE_MACHINE_VERSION } from "./version.js";
import { runQueryableTransaction } from "./tx-connection.js";

export type TxQueryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
  /**
   * Optional: run work on a single reserved connection (PoolClient).
   * Production Pool adapters MUST implement this — never BEGIN via pool.query.
   */
  runInTransaction?: <T>(fn: (tx: TxQueryable) => Promise<T>) => Promise<T>;
};

type TxRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  current_price: string | number | null;
  currency: string;
  version: number;
  idempotency_key: string | null;
  state_machine_version: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapTx(r: TxRow): VautoTransaction {
  return {
    id: r.id,
    listingId: r.listing_id,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    status: r.status as TransactionStatus,
    currentPrice:
      r.current_price == null
        ? null
        : typeof r.current_price === "number"
          ? r.current_price
          : Number(r.current_price),
    currency: r.currency,
    version: Number(r.version),
    idempotencyKey: r.idempotency_key,
    stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TRANSACTION_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../migrations/039_transaction_state_machine_1.0.sql"
  ),
  "utf8"
);

export const TRANSACTION_MIGRATION_ID = "039_transaction_state_machine_1.0";

export type CreateTransactionInput = {
  id?: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  currentPrice?: number | null;
  currency?: string;
  idempotencyKey?: string;
};

export class TransactionRepository {
  constructor(private readonly db: TxQueryable) {}

  async create(input: CreateTransactionInput): Promise<VautoTransaction> {
    const parsed = CreateTransactionInputSchema.parse(input);
    if (parsed.idempotencyKey) {
      const existing = await this.db.query<TxRow>(
        `SELECT * FROM vauto_transactions WHERE idempotency_key = $1 LIMIT 1`,
        [parsed.idempotencyKey]
      );
      if (existing.rows[0]) return mapTx(existing.rows[0]);
    }
    const id = parsed.id ?? randomUUID();
    const rows = await this.db.query<TxRow>(
      `INSERT INTO vauto_transactions (
         id, listing_id, buyer_id, seller_id, status, current_price, currency,
         version, idempotency_key, state_machine_version, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,'DISCUSSION',$5,$6,0,$7,'1.0',NOW(),NOW())
       RETURNING *`,
      [
        id,
        parsed.listingId,
        parsed.buyerId,
        parsed.sellerId,
        parsed.currentPrice ?? null,
        parsed.currency ?? "EUR",
        parsed.idempotencyKey ?? null,
      ]
    );
    return mapTx(rows.rows[0]!);
  }

  async getById(id: string): Promise<VautoTransaction | null> {
    const rows = await this.db.query<TxRow>(
      `SELECT * FROM vauto_transactions WHERE id = $1`,
      [id]
    );
    return rows.rows[0] ? mapTx(rows.rows[0]) : null;
  }

  /** Read-only list for the authenticated party (buyer or seller). */
  async listForActor(actorUserId: string, limit = 50): Promise<VautoTransaction[]> {
    const cap = Math.min(Math.max(1, limit), 100);
    const rows = await this.db.query<TxRow>(
      `SELECT * FROM vauto_transactions
       WHERE buyer_id = $1 OR seller_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [actorUserId, cap]
    );
    return rows.rows.map(mapTx);
  }

  async listEvents(transactionId: string): Promise<TransactionEventRecord[]> {
    const rows = await this.db.query<{
      id: string;
      transaction_id: string;
      actor_type: string;
      actor_id: string;
      event_type: string;
      from_status: string;
      to_status: string;
      idempotency_key: string;
      payload_json: Record<string, unknown> | string;
      created_at: Date | string;
    }>(
      `SELECT * FROM vauto_transaction_events
       WHERE transaction_id = $1 ORDER BY created_at ASC`,
      [transactionId]
    );
    return rows.rows.map((r) => ({
      id: r.id,
      transactionId: r.transaction_id,
      actorType: r.actor_type as ActorType,
      actorId: r.actor_id,
      eventType: r.event_type,
      fromStatus: r.from_status as TransactionStatus,
      toStatus: r.to_status as TransactionStatus,
      idempotencyKey: r.idempotency_key,
      payloadJson:
        typeof r.payload_json === "string"
          ? (JSON.parse(r.payload_json) as Record<string, unknown>)
          : r.payload_json,
      createdAt: iso(r.created_at),
    }));
  }

  async listAudit(transactionId: string): Promise<
    Array<{
      id: string;
      transactionId: string;
      sequenceId: number;
      eventId: string;
      stateHash: string;
      createdAt: string;
    }>
  > {
    const rows = await this.db.query<{
      id: string;
      transaction_id: string;
      sequence_id: number;
      event_id: string;
      state_hash: string;
      created_at: Date | string;
    }>(
      `SELECT * FROM vauto_transaction_audit
       WHERE transaction_id = $1 ORDER BY sequence_id ASC`,
      [transactionId]
    );
    return rows.rows.map((r) => ({
      id: r.id,
      transactionId: r.transaction_id,
      sequenceId: Number(r.sequence_id),
      eventId: r.event_id,
      stateHash: r.state_hash,
      createdAt: iso(r.created_at),
    }));
  }

  private async getByIdOn(
    client: TxQueryable,
    id: string
  ): Promise<VautoTransaction | null> {
    const rows = await client.query<TxRow>(
      `SELECT * FROM vauto_transactions WHERE id = $1`,
      [id]
    );
    return rows.rows[0] ? mapTx(rows.rows[0]) : null;
  }

  /**
   * State transition on an **already active** single-connection TX client.
   * Must not be called with a bare Pool queryable outside a transaction.
   */
  async executeTransitionInTx(
    client: TxQueryable,
    cmd: TransitionCommand
  ): Promise<TransitionResult> {
    if (!client) {
      throw new Error("executeTransitionInTx requires an active DB client");
    }
    const parsed = TransitionCommandSchema.parse(cmd);

    const prior = await client.query<{
      id: string;
      from_status: string;
      to_status: string;
      payload_json: Record<string, unknown> | string;
    }>(
      `SELECT id, from_status, to_status, payload_json
       FROM vauto_transaction_events
       WHERE transaction_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [parsed.transactionId, parsed.idempotencyKey]
    );
    if (prior.rows[0]) {
      const p = prior.rows[0];
      const payload =
        typeof p.payload_json === "string"
          ? (JSON.parse(p.payload_json) as Record<string, unknown>)
          : p.payload_json;
      const fp = String(payload.fingerprint ?? "");
      const expectedFp = computeIdempotencyFingerprint({
        transactionId: parsed.transactionId,
        toStatus: parsed.toStatus,
        actorType: parsed.actorType,
        actorId: parsed.actorId,
        reasonCode: parsed.reasonCode,
        expectedVersion: parsed.expectedVersion,
      });
      if (fp && fp !== expectedFp) {
        throw new IdempotencyConflictError(parsed.idempotencyKey);
      }
      const tx = await this.getByIdOn(client, parsed.transactionId);
      if (!tx) throw new TransactionNotFoundError(parsed.transactionId);
      const audit = await client.query<{ id: string }>(
        `SELECT id FROM vauto_transaction_audit WHERE event_id = $1 LIMIT 1`,
        [p.id]
      );
      return {
        transaction: tx,
        eventId: p.id,
        auditId: audit.rows[0]?.id ?? "",
        fromStatus: p.from_status as TransactionStatus,
        toStatus: p.to_status as TransactionStatus,
        idempotentReplay: true,
        stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
      };
    }

    const current = await this.getByIdOn(client, parsed.transactionId);
    if (!current) throw new TransactionNotFoundError(parsed.transactionId);

    // Optimistic lock first — stale clients get 409, not a misleading matrix error
    if (current.version !== parsed.expectedVersion) {
      throw new VersionConflictError(
        parsed.transactionId,
        parsed.expectedVersion
      );
    }

    assertTransitionAllowed(
      current.status,
      parsed.toStatus,
      parsed.actorType,
      parsed.reasonCode as ReasonCode
    );

    const fingerprint = computeIdempotencyFingerprint({
      transactionId: parsed.transactionId,
      toStatus: parsed.toStatus,
      actorType: parsed.actorType,
      actorId: parsed.actorId,
      reasonCode: parsed.reasonCode,
      expectedVersion: parsed.expectedVersion,
    });

    const eventId = randomUUID();
    const fromStatus = current.status;
    const nextVersion = current.version + 1;

    const updated = await client.query<TxRow>(
      `UPDATE vauto_transactions
       SET status = $1,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $2 AND version = $3
       RETURNING *`,
      [parsed.toStatus, parsed.transactionId, parsed.expectedVersion]
    );
    if (!updated.rows[0]) {
      throw new VersionConflictError(
        parsed.transactionId,
        parsed.expectedVersion
      );
    }

    const payload = {
      reasonCode: parsed.reasonCode,
      metadata: parsed.metadata ?? null,
      fingerprint,
      stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
    };

    await client.query(
      `INSERT INTO vauto_transaction_events (
         id, transaction_id, actor_type, actor_id, event_type,
         from_status, to_status, idempotency_key, payload_json, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW())`,
      [
        eventId,
        parsed.transactionId,
        parsed.actorType,
        parsed.actorId,
        "STATUS_TRANSITION",
        fromStatus,
        parsed.toStatus,
        parsed.idempotencyKey,
        JSON.stringify(payload),
      ]
    );

    const seqRow = await client.query<{ next_seq: number }>(
      `SELECT COALESCE(MAX(sequence_id), 0) + 1 AS next_seq
       FROM vauto_transaction_audit WHERE transaction_id = $1`,
      [parsed.transactionId]
    );
    const sequenceId = Number(seqRow.rows[0]?.next_seq ?? 1);

    const prevHashRow = await client.query<{ state_hash: string }>(
      `SELECT state_hash FROM vauto_transaction_audit
       WHERE transaction_id = $1 ORDER BY sequence_id DESC LIMIT 1`,
      [parsed.transactionId]
    );
    const previousHash = prevHashRow.rows[0]?.state_hash ?? null;

    const audit = buildAuditRecord({
      transactionId: parsed.transactionId,
      sequenceId,
      eventId,
      fromStatus,
      toStatus: parsed.toStatus,
      versionAfter: nextVersion,
      actorType: parsed.actorType,
      actorId: parsed.actorId,
      reasonCode: parsed.reasonCode,
      previousHash,
    });

    await client.query(
      `INSERT INTO vauto_transaction_audit (
         id, transaction_id, sequence_id, event_id, state_hash, created_at
       ) VALUES ($1,$2,$3,$4,$5,NOW())`,
      [
        audit.id,
        audit.transactionId,
        audit.sequenceId,
        audit.eventId,
        audit.stateHash,
      ]
    );

    return {
      transaction: mapTx(updated.rows[0]),
      eventId,
      auditId: audit.id,
      fromStatus,
      toStatus: parsed.toStatus,
      idempotentReplay: false,
      stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
    };
  }

  /**
   * Opens a single-connection TX then runs executeTransitionInTx.
   * Prefer executeTransitionInTx when already inside an outer Stage 11 TX.
   */
  async executeTransition(cmd: TransitionCommand): Promise<TransitionResult> {
    return runQueryableTransaction(this.db, (client) =>
      this.executeTransitionInTx(client, cmd)
    );
  }
}

export function createTransactionRepository(
  db: TxQueryable
): TransactionRepository {
  return new TransactionRepository(db);
}
