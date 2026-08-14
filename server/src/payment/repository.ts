/**
 * Payment Domain PostgreSQL repository — intents + ledger reads/writes.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TxQueryable } from "../transaction/repository.js";
import { PAYMENT_LEDGER_VERSION } from "./version.js";
import type { PaymentIntent, PaymentIntentStatus, TransferStatus } from "./types.js";
import {
  PaymentVersionConflictError,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PAYMENT_LEDGER_MIGRATION_ID = "044_payment_domain_ledger_1.0";
export const PAYMENT_LEDGER_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../migrations/044_payment_domain_ledger_1.0.sql"
  ),
  "utf8"
);

type IntentRow = {
  id: string;
  transaction_id: string;
  deal_snapshot_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  version: number;
  idempotency_key: string;
  payment_ledger_version: string;
  stripe_payment_intent_id?: string | null;
  stripe_client_secret?: string | null;
  provider_status?: string | null;
  platform_fee_cents?: number;
  seller_net_cents?: number;
  stripe_transfer_id?: string | null;
  stripe_refund_id?: string | null;
  transfer_status?: string;
  execution_token?: string | null;
  execution_started_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

export function mapIntentRow(r: IntentRow): PaymentIntent {
  const started = r.execution_started_at ?? null;
  return {
    id: r.id,
    transactionId: r.transaction_id,
    dealSnapshotId: r.deal_snapshot_id,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    amountCents: Number(r.amount_cents),
    currency: "EUR",
    status: r.status as PaymentIntentStatus,
    version: Number(r.version),
    idempotencyKey: r.idempotency_key,
    paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
    stripePaymentIntentId: r.stripe_payment_intent_id ?? null,
    stripeClientSecret: r.stripe_client_secret ?? null,
    providerStatus: r.provider_status ?? null,
    platformFeeCents: Number(r.platform_fee_cents ?? 0),
    sellerNetCents: Number(r.seller_net_cents ?? 0),
    stripeTransferId: r.stripe_transfer_id ?? null,
    stripeRefundId: r.stripe_refund_id ?? null,
    transferStatus: (r.transfer_status ?? "NOT_STARTED") as TransferStatus,
    executionToken: r.execution_token ?? null,
    executionStartedAt:
      started == null
        ? null
        : typeof started === "string"
          ? started
          : started.toISOString(),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export class PaymentRepository {
  constructor(private readonly db: TxQueryable) {}

  async getByTransactionId(
    transactionId: string
  ): Promise<PaymentIntent | null> {
    const res = await this.db.query<IntentRow>(
      `SELECT * FROM vauto_payment_intents WHERE transaction_id = $1 LIMIT 1`,
      [transactionId]
    );
    return res.rows[0] ? mapIntentRow(res.rows[0]) : null;
  }

  /** Stage 11F.5 — row lock for release/refund race determinism. */
  async getByTransactionIdForUpdate(
    client: TxQueryable,
    transactionId: string
  ): Promise<PaymentIntent | null> {
    const res = await client.query<IntentRow>(
      `SELECT * FROM vauto_payment_intents WHERE transaction_id = $1 FOR UPDATE LIMIT 1`,
      [transactionId]
    );
    return res.rows[0] ? mapIntentRow(res.rows[0]) : null;
  }

  async getByIdempotencyKey(
    idempotencyKey: string
  ): Promise<PaymentIntent | null> {
    const res = await this.db.query<IntentRow>(
      `SELECT * FROM vauto_payment_intents WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey]
    );
    return res.rows[0] ? mapIntentRow(res.rows[0]) : null;
  }

  async getById(id: string): Promise<PaymentIntent | null> {
    const res = await this.db.query<IntentRow>(
      `SELECT * FROM vauto_payment_intents WHERE id = $1 LIMIT 1`,
      [id]
    );
    return res.rows[0] ? mapIntentRow(res.rows[0]) : null;
  }

  async getByStripePaymentIntentId(
    stripePaymentIntentId: string
  ): Promise<PaymentIntent | null> {
    const res = await this.db.query<IntentRow>(
      `SELECT * FROM vauto_payment_intents WHERE stripe_payment_intent_id = $1 LIMIT 1`,
      [stripePaymentIntentId]
    );
    return res.rows[0] ? mapIntentRow(res.rows[0]) : null;
  }

  async insertCreated(input: {
    transactionId: string;
    dealSnapshotId: string;
    buyerId: string;
    sellerId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<PaymentIntent> {
    const id = randomUUID();
    const res = await this.db.query<IntentRow>(
      `INSERT INTO vauto_payment_intents (
         id, transaction_id, deal_snapshot_id, buyer_id, seller_id,
         amount_cents, currency, status, version, idempotency_key,
         payment_ledger_version
       ) VALUES ($1,$2,$3,$4,$5,$6,'EUR','CREATED',0,$7,$8)
       RETURNING *`,
      [
        id,
        input.transactionId,
        input.dealSnapshotId,
        input.buyerId,
        input.sellerId,
        input.amountCents,
        input.idempotencyKey,
        PAYMENT_LEDGER_VERSION,
      ]
    );
    return mapIntentRow(res.rows[0]!);
  }

  async updateStatus(
    client: TxQueryable,
    input: {
      id: string;
      expectedVersion: number;
      toStatus: PaymentIntentStatus;
    }
  ): Promise<PaymentIntent> {
    const res = await client.query<IntentRow>(
      `UPDATE vauto_payment_intents
       SET status = $1,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $2 AND version = $3
       RETURNING *`,
      [input.toStatus, input.id, input.expectedVersion]
    );
    if (!res.rows[0]) {
      throw new PaymentVersionConflictError(input.id, input.expectedVersion);
    }
    return mapIntentRow(res.rows[0]);
  }

  /** Stage 11F.2 TX2 — attach Stripe provider ids and move CREATED → AUTHORIZING. */
  async attachStripeProvider(
    client: TxQueryable,
    input: {
      id: string;
      expectedVersion: number;
      stripePaymentIntentId: string;
      stripeClientSecret: string;
      providerStatus: string;
      toStatus?: PaymentIntentStatus;
    }
  ): Promise<PaymentIntent> {
    const toStatus = input.toStatus ?? "AUTHORIZING";
    const res = await client.query<IntentRow>(
      `UPDATE vauto_payment_intents
       SET stripe_payment_intent_id = $1,
           stripe_client_secret = $2,
           provider_status = $3,
           status = $4,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $5 AND version = $6
       RETURNING *`,
      [
        input.stripePaymentIntentId,
        input.stripeClientSecret,
        input.providerStatus,
        toStatus,
        input.id,
        input.expectedVersion,
      ]
    );
    if (!res.rows[0]) {
      throw new PaymentVersionConflictError(input.id, input.expectedVersion);
    }
    return mapIntentRow(res.rows[0]);
  }

  /** Stage 11F.4 — set fee split + transfer lifecycle fields. */
  async updateTransferFields(
    client: TxQueryable,
    input: {
      id: string;
      expectedVersion: number;
      platformFeeCents?: number;
      sellerNetCents?: number;
      transferStatus?: TransferStatus;
      stripeTransferId?: string | null;
      stripeRefundId?: string | null;
      toStatus?: PaymentIntentStatus;
      executionToken?: string | null;
      executionStartedAt?: string | null;
      clearExecutionLock?: boolean;
    }
  ): Promise<PaymentIntent> {
    const current = await client.query<IntentRow>(
      `SELECT * FROM vauto_payment_intents WHERE id = $1 LIMIT 1`,
      [input.id]
    );
    const row = current.rows[0];
    if (!row || Number(row.version) !== input.expectedVersion) {
      throw new PaymentVersionConflictError(input.id, input.expectedVersion);
    }
    const fee =
      input.platformFeeCents != null
        ? input.platformFeeCents
        : Number(row.platform_fee_cents ?? 0);
    const net =
      input.sellerNetCents != null
        ? input.sellerNetCents
        : Number(row.seller_net_cents ?? 0);
    const transferStatus = input.transferStatus ?? row.transfer_status ?? "NOT_STARTED";
    const stripeTransferId =
      input.stripeTransferId !== undefined
        ? input.stripeTransferId
        : row.stripe_transfer_id ?? null;
    const stripeRefundId =
      input.stripeRefundId !== undefined
        ? input.stripeRefundId
        : row.stripe_refund_id ?? null;
    const status = input.toStatus ?? row.status;
    const clearLock = input.clearExecutionLock === true;
    const executionToken = clearLock
      ? null
      : input.executionToken !== undefined
        ? input.executionToken
        : row.execution_token ?? null;
    const executionStartedAt = clearLock
      ? null
      : input.executionStartedAt !== undefined
        ? input.executionStartedAt
        : row.execution_started_at ?? null;

    const res = await client.query<IntentRow>(
      `UPDATE vauto_payment_intents
       SET platform_fee_cents = $1,
           seller_net_cents = $2,
           transfer_status = $3,
           stripe_transfer_id = $4,
           stripe_refund_id = $5,
           status = $6,
           execution_token = $7,
           execution_started_at = $8::timestamptz,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $9 AND version = $10
       RETURNING *`,
      [
        fee,
        net,
        transferStatus,
        stripeTransferId,
        stripeRefundId,
        status,
        executionToken,
        executionStartedAt,
        input.id,
        input.expectedVersion,
      ]
    );
    if (!res.rows[0]) {
      throw new PaymentVersionConflictError(input.id, input.expectedVersion);
    }
    return mapIntentRow(res.rows[0]);
  }

  /**
   * Stage 11H.3 — atomic pre-Stripe execution lock (TOCTOU close).
   * Returns locked row or null if dispute/block/already executing/transferred.
   */
  async tryAcquireTransferExecutionLock(
    client: TxQueryable,
    input: { paymentIntentId: string; executionToken: string }
  ): Promise<PaymentIntent | null> {
    const baseSet = `UPDATE vauto_payment_intents
       SET transfer_status = 'TRANSFER_EXECUTING',
           execution_token = $1,
           execution_started_at = NOW(),
           version = version + 1,
           updated_at = NOW()
       WHERE id = $2
         AND transfer_status NOT IN (
           'TRANSFER_BLOCKED',
           'TRANSFER_EXECUTING',
           'TRANSFERRED',
           'REFUNDED',
           'REFUND_PENDING'
         )`;
    const withDispute = `${baseSet}
         AND transaction_id NOT IN (
           SELECT transaction_id FROM vauto_disputes WHERE status = 'OPEN'
         )
       RETURNING *`;
    const withoutDispute = `${baseSet}
       RETURNING *`;

    try {
      const res = await client.query<IntentRow>(withDispute, [
        input.executionToken,
        input.paymentIntentId,
      ]);
      return res.rows[0] ? mapIntentRow(res.rows[0]) : null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/vauto_disputes/i.test(msg)) throw e;
      const res = await client.query<IntentRow>(withoutDispute, [
        input.executionToken,
        input.paymentIntentId,
      ]);
      return res.rows[0] ? mapIntentRow(res.rows[0]) : null;
    }
  }

  /** Release EXECUTING lock back to TRANSFER_PENDING after provider failure. */
  async releaseTransferExecutionLock(
    client: TxQueryable,
    input: { paymentIntentId: string; executionToken: string }
  ): Promise<void> {
    await client.query(
      `UPDATE vauto_payment_intents
       SET transfer_status = 'TRANSFER_PENDING',
           execution_token = NULL,
           execution_started_at = NULL,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1
         AND execution_token = $2
         AND transfer_status = 'TRANSFER_EXECUTING'`,
      [input.paymentIntentId, input.executionToken]
    );
  }
}
