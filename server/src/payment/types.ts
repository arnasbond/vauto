/**
 * Payment Domain & Ledger 1.0 — types.
 * Amount/currency are server-loaded from deal snapshots only.
 */

import type { PAYMENT_LEDGER_VERSION } from "./version.js";

export const PAYMENT_INTENT_STATUSES = [
  "CREATED",
  "AUTHORIZING",
  "HELD_IN_ESCROW",
  "RELEASED_TO_SELLER",
  "REFUND_PENDING",
  "REFUNDED",
  "FAILED",
] as const;

export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const PAYMENT_TERMINAL_STATUSES = [
  "RELEASED_TO_SELLER",
  "REFUNDED",
] as const;

export type PaymentTerminalStatus = (typeof PAYMENT_TERMINAL_STATUSES)[number];

export const LEDGER_ENTRY_TYPES = [
  "DEBIT",
  "CREDIT",
  "FEE",
  "ESCROW_HOLD",
  "ESCROW_RELEASE",
  "REFUND",
  "BUYER_PAYMENT_RECEIVED",
  "PLATFORM_FEE_RESERVED",
  "SELLER_TRANSFER_PENDING",
  "SELLER_TRANSFERRED",
  "BUYER_REFUND_PENDING",
  "BUYER_REFUNDED",
  "TRANSFER_REVERSED",
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const TRANSFER_STATUSES = [
  "NOT_STARTED",
  "TRANSFER_PENDING",
  "TRANSFER_EXECUTING",
  "TRANSFERRED",
  "TRANSFER_BLOCKED",
  "REFUND_PENDING",
  "REFUNDED",
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export type PaymentIntent = {
  id: string;
  transactionId: string;
  dealSnapshotId: string;
  buyerId: string;
  sellerId: string;
  amountCents: number;
  currency: "EUR";
  status: PaymentIntentStatus;
  version: number;
  idempotencyKey: string;
  paymentLedgerVersion: typeof PAYMENT_LEDGER_VERSION;
  /** Stage 11F.2 — PSP provider fields (nullable until Stripe attach). */
  stripePaymentIntentId: string | null;
  stripeClientSecret: string | null;
  providerStatus: string | null;
  /** Stage 11F.4 — Connect transfer / fee split. */
  platformFeeCents: number;
  sellerNetCents: number;
  stripeTransferId: string | null;
  stripeRefundId: string | null;
  transferStatus: TransferStatus;
  /** Stage 11H.3 — atomic pre-Stripe execution lock. */
  executionToken: string | null;
  executionStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentLedgerEntry = {
  id: string;
  paymentIntentId: string;
  transactionId: string;
  entryType: LedgerEntryType;
  amountCents: number;
  runningBalanceCents: number;
  currency: "EUR";
  actorId: string;
  idempotencyKey: string;
  entryHash: string;
  payloadJson: Record<string, unknown>;
  createdAt: string;
};

export type CreatePaymentIntentResult = {
  paymentIntent: PaymentIntent;
  ledgerEntry: PaymentLedgerEntry;
  transaction: {
    id: string;
    status: string;
    version: number;
  };
  idempotentReplay: boolean;
  paymentLedgerVersion: typeof PAYMENT_LEDGER_VERSION;
};

export type GetPaymentIntentResult = {
  paymentIntent: PaymentIntent;
  ledger: PaymentLedgerEntry[];
  paymentLedgerVersion: typeof PAYMENT_LEDGER_VERSION;
};

export class PaymentAuthError extends Error {
  readonly code = "PAYMENT_FORBIDDEN" as const;
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "PaymentAuthError";
  }
}

export class PaymentNotFoundError extends Error {
  readonly code = "PAYMENT_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "PaymentNotFoundError";
  }
}

export class PaymentStateError extends Error {
  readonly code = "PAYMENT_INVALID_STATE" as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = "PaymentStateError";
  }
}

/** Reconciliation mismatch — snapshot cents ≠ accepted offer cents. */
export class FinancialReconciliationError extends Error {
  readonly code = "UNPROCESSABLE_FINANCIAL_ENTITY" as const;
  readonly httpStatus = 422;
  constructor(
    public readonly snapshotAmountCents: number,
    public readonly offerAmountCents: number
  ) {
    super(
      `Financial reconciliation failed: snapshot=${snapshotAmountCents} offer=${offerAmountCents}`
    );
    this.name = "FinancialReconciliationError";
  }
}

export class PaymentIdempotencyConflictError extends Error {
  readonly code = "PAYMENT_IDEMPOTENCY_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(public readonly idempotencyKey: string) {
    super(`Idempotency key conflict: ${idempotencyKey}`);
    this.name = "PaymentIdempotencyConflictError";
  }
}

export class PaymentVersionConflictError extends Error {
  readonly code = "PAYMENT_VERSION_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(
    public readonly paymentIntentId: string,
    public readonly expectedVersion: number
  ) {
    super(
      `Concurrent modification on payment intent ${paymentIntentId} (expected version ${expectedVersion})`
    );
    this.name = "PaymentVersionConflictError";
  }
}
