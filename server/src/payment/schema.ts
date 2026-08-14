/**
 * Payment Domain & Ledger 1.0 — Zod strict schemas.
 * Client may send ONLY idempotencyKey (transactionId from URL).
 */

import { z } from "zod";
import { PAYMENT_LEDGER_VERSION } from "./version.js";
import {
  LEDGER_ENTRY_TYPES,
  PAYMENT_INTENT_STATUSES,
} from "./types.js";

export const AmountCentsSchema = z
  .number()
  .int("amount_cents_must_be_integer")
  .positive("amount_cents_must_be_positive");

export const CurrencySchema = z.literal("EUR");

export const PaymentIntentStatusSchema = z.enum(PAYMENT_INTENT_STATUSES);
export const LedgerEntryTypeSchema = z.enum(LEDGER_ENTRY_TYPES);

const CLIENT_FORBIDDEN_FIELDS = [
  "amount",
  "amountCents",
  "amount_cents",
  "currency",
  "sellerId",
  "seller_id",
  "buyerId",
  "buyer_id",
  "status",
  "dealSnapshotId",
  "deal_snapshot_id",
  "transactionId",
  "transaction_id",
  "version",
] as const;

/** POST body — server loads amount/currency/parties from snapshot. */
export const CreatePaymentIntentBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .superRefine((body, ctx) => {
    for (const k of CLIENT_FORBIDDEN_FIELDS) {
      if (k in (body as Record<string, unknown>)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `client_${k}_forbidden`,
        });
      }
    }
  });

export const PaymentIntentSchema = z
  .object({
    id: z.string().min(1).max(128),
    transactionId: z.string().min(1).max(128),
    dealSnapshotId: z.string().min(1).max(128),
    buyerId: z.string().min(1).max(128),
    sellerId: z.string().min(1).max(128),
    amountCents: AmountCentsSchema,
    currency: CurrencySchema,
    status: PaymentIntentStatusSchema,
    version: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(1).max(200),
    paymentLedgerVersion: z.literal(PAYMENT_LEDGER_VERSION),
    stripePaymentIntentId: z.string().min(1).max(200).nullable(),
    stripeClientSecret: z.string().min(1).max(500).nullable(),
    providerStatus: z.string().min(1).max(64).nullable(),
    platformFeeCents: z.number().int().nonnegative(),
    sellerNetCents: z.number().int().nonnegative(),
    stripeTransferId: z.string().min(1).max(200).nullable(),
    stripeRefundId: z.string().min(1).max(200).nullable(),
    transferStatus: z.enum([
      "NOT_STARTED",
      "TRANSFER_PENDING",
      "TRANSFER_EXECUTING",
      "TRANSFERRED",
      "TRANSFER_BLOCKED",
      "REFUND_PENDING",
      "REFUNDED",
    ]),
    executionToken: z.string().nullable(),
    executionStartedAt: z.string().nullable(),
    createdAt: z.string().min(10),
    updatedAt: z.string().min(10),
  })
  .strict();

export const PaymentLedgerEntrySchema = z
  .object({
    id: z.string().min(1).max(128),
    paymentIntentId: z.string().min(1).max(128),
    transactionId: z.string().min(1).max(128),
    entryType: LedgerEntryTypeSchema,
    amountCents: AmountCentsSchema,
    runningBalanceCents: z.number().int(),
    currency: CurrencySchema,
    actorId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(1).max(200),
    entryHash: z.string().min(16).max(128),
    payloadJson: z.record(z.unknown()),
    createdAt: z.string().min(10),
  })
  .strict();

export const CreatePaymentIntentResultSchema = z
  .object({
    paymentIntent: PaymentIntentSchema,
    ledgerEntry: PaymentLedgerEntrySchema,
    transaction: z
      .object({
        id: z.string().min(1),
        status: z.string().min(1),
        version: z.number().int().nonnegative(),
      })
      .strict(),
    idempotentReplay: z.boolean(),
    paymentLedgerVersion: z.literal(PAYMENT_LEDGER_VERSION),
  })
  .strict();
