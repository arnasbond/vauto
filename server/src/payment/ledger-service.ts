/**
 * Append-only ledger writer — atomic inserts inside an active DB TX.
 * No UPDATE/DELETE paths (enforced by DB triggers).
 */

import { createHash, randomUUID } from "node:crypto";
import type { TxQueryable } from "../transaction/repository.js";
import type { LedgerEntryType, PaymentLedgerEntry } from "./types.js";
import { PaymentIdempotencyConflictError } from "./types.js";

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function computeLedgerEntryHash(input: {
  paymentIntentId: string;
  transactionId: string;
  entryType: LedgerEntryType;
  amountCents: number;
  runningBalanceCents: number;
  currency: "EUR";
  actorId: string;
  idempotencyKey: string;
  payloadJson: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(
      stableStringify({
        paymentIntentId: input.paymentIntentId,
        transactionId: input.transactionId,
        entryType: input.entryType,
        amountCents: input.amountCents,
        runningBalanceCents: input.runningBalanceCents,
        currency: input.currency,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        payloadJson: input.payloadJson,
      })
    )
    .digest("hex");
}

type LedgerRow = {
  id: string;
  payment_intent_id: string;
  transaction_id: string;
  entry_type: string;
  amount_cents: number;
  running_balance_cents: number;
  currency: string;
  actor_id: string;
  idempotency_key: string;
  entry_hash: string;
  payload_json: Record<string, unknown> | string;
  created_at: Date | string;
};

export function mapLedgerRow(r: LedgerRow): PaymentLedgerEntry {
  const payload =
    typeof r.payload_json === "string"
      ? (JSON.parse(r.payload_json) as Record<string, unknown>)
      : (r.payload_json ?? {});
  return {
    id: r.id,
    paymentIntentId: r.payment_intent_id,
    transactionId: r.transaction_id,
    entryType: r.entry_type as LedgerEntryType,
    amountCents: Number(r.amount_cents),
    runningBalanceCents: Number(r.running_balance_cents),
    currency: "EUR",
    actorId: r.actor_id,
    idempotencyKey: r.idempotency_key,
    entryHash: r.entry_hash,
    payloadJson: payload,
    createdAt: iso(r.created_at),
  };
}

export async function getLatestRunningBalance(
  db: TxQueryable,
  paymentIntentId: string
): Promise<number> {
  const res = await db.query<{ running_balance_cents: number }>(
    `SELECT running_balance_cents
     FROM vauto_payment_ledger
     WHERE payment_intent_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [paymentIntentId]
  );
  return res.rows[0] ? Number(res.rows[0].running_balance_cents) : 0;
}

export async function getLedgerEntryByIdempotency(
  db: TxQueryable,
  idempotencyKey: string
): Promise<PaymentLedgerEntry | null> {
  const res = await db.query<LedgerRow>(
    `SELECT * FROM vauto_payment_ledger WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey]
  );
  return res.rows[0] ? mapLedgerRow(res.rows[0]) : null;
}

export async function listLedgerForIntent(
  db: TxQueryable,
  paymentIntentId: string
): Promise<PaymentLedgerEntry[]> {
  const res = await db.query<LedgerRow>(
    `SELECT * FROM vauto_payment_ledger
     WHERE payment_intent_id = $1
     ORDER BY created_at ASC, id ASC`,
    [paymentIntentId]
  );
  return res.rows.map(mapLedgerRow);
}

/**
 * Append one immutable ledger row. Balance delta:
 * + ESCROW_HOLD / DEBIT / FEE → increase escrow balance
 * − ESCROW_RELEASE / REFUND / CREDIT → decrease escrow balance
 */
export async function appendLedgerEntry(
  db: TxQueryable,
  input: {
    paymentIntentId: string;
    transactionId: string;
    entryType: LedgerEntryType;
    amountCents: number;
    actorId: string;
    idempotencyKey: string;
    payloadJson?: Record<string, unknown>;
  }
): Promise<PaymentLedgerEntry> {
  const existing = await getLedgerEntryByIdempotency(db, input.idempotencyKey);
  if (existing) {
    if (
      existing.paymentIntentId !== input.paymentIntentId ||
      existing.entryType !== input.entryType ||
      existing.amountCents !== input.amountCents
    ) {
      throw new PaymentIdempotencyConflictError(input.idempotencyKey);
    }
    return existing;
  }

  const prev = await getLatestRunningBalance(db, input.paymentIntentId);
  // Escrow balance: only HOLD increases; RELEASE/REFUND/CREDIT decrease.
  // DEBIT/FEE are memorandum entries (intent/fee recorded, no escrow balance change).
  let delta = 0;
  if (
    input.entryType === "ESCROW_HOLD" ||
    input.entryType === "TRANSFER_REVERSED"
  ) {
    delta = input.amountCents;
  } else if (
    input.entryType === "ESCROW_RELEASE" ||
    input.entryType === "REFUND" ||
    input.entryType === "CREDIT" ||
    input.entryType === "SELLER_TRANSFERRED" ||
    input.entryType === "BUYER_REFUNDED"
  ) {
    delta = -input.amountCents;
  }
  // BUYER_PAYMENT_RECEIVED / PLATFORM_FEE_RESERVED / SELLER_TRANSFER_PENDING /
  // BUYER_REFUND_PENDING / DEBIT / FEE — memorandum (delta 0)
  const runningBalanceCents = prev + delta;
  const payloadJson = input.payloadJson ?? {};
  const entryHash = computeLedgerEntryHash({
    paymentIntentId: input.paymentIntentId,
    transactionId: input.transactionId,
    entryType: input.entryType,
    amountCents: input.amountCents,
    runningBalanceCents,
    currency: "EUR",
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
    payloadJson,
  });
  const id = randomUUID();

  const inserted = await db.query<LedgerRow>(
    `INSERT INTO vauto_payment_ledger (
       id, payment_intent_id, transaction_id, entry_type, amount_cents,
       running_balance_cents, currency, actor_id, idempotency_key,
       entry_hash, payload_json
     ) VALUES ($1,$2,$3,$4,$5,$6,'EUR',$7,$8,$9,$10::jsonb)
     RETURNING *`,
    [
      id,
      input.paymentIntentId,
      input.transactionId,
      input.entryType,
      input.amountCents,
      runningBalanceCents,
      input.actorId,
      input.idempotencyKey,
      entryHash,
      JSON.stringify(payloadJson),
    ]
  );
  return mapLedgerRow(inserted.rows[0]!);
}
