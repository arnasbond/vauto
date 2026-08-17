/**
 * Transaction State Machine 1.0 — Zod strict schemas.
 */

import { z } from "zod";
import { TRANSACTION_STATE_MACHINE_VERSION } from "./version.js";
import {
  ACTOR_TYPES,
  FULFILLMENT_TYPES,
  PAYMENT_MODES,
  REASON_CODES,
  TRANSACTION_STATUSES,
  VERIFICATION_POLICIES,
  VERTICALS,
} from "./types.js";

export const TransactionStatusSchema = z.enum(TRANSACTION_STATUSES);
export const ActorTypeSchema = z.enum(ACTOR_TYPES);
export const ReasonCodeSchema = z.enum(REASON_CODES);

export const VautoTransactionSchema = z
  .object({
    id: z.string().min(1).max(128),
    listingId: z.string().min(1).max(128),
    buyerId: z.string().min(1).max(128),
    sellerId: z.string().min(1).max(128),
    status: TransactionStatusSchema,
    /** UI display only — payment authority is deal snapshot / offer cents (11E.1 M-03). */
    currentPrice: z.number().finite().nonnegative().nullable(),
    currency: z.string().min(1).max(8).default("EUR"),
    version: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(1).max(200).nullable(),
    stateMachineVersion: z.literal(TRANSACTION_STATE_MACHINE_VERSION),
    createdAt: z.string().min(10).max(40),
    updatedAt: z.string().min(10).max(40),
    vertical: z.enum(VERTICALS).default("GOODS"),
    fulfillmentType: z.enum(FULFILLMENT_TYPES).default("CARRIER_DELIVERY"),
    paymentMode: z.enum(PAYMENT_MODES).default("FULL_ESCROW"),
    verificationPolicy: z.enum(VERIFICATION_POLICIES).default("PLATFORM_TRANSACTION"),
    contractValueCents: z.number().int().nonnegative().nullable().default(null),
    platformManagedAmountCents: z.number().int().nonnegative().default(0),
    interactionClaimedBy: z.string().min(1).max(128).nullable().optional(),
  })
  .strict();

export const TransitionCommandSchema = z
  .object({
    transactionId: z.string().min(1).max(128),
    expectedVersion: z.number().int().nonnegative(),
    toStatus: TransactionStatusSchema,
    actorType: ActorTypeSchema,
    actorId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: ReasonCodeSchema,
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .strict()
  .superRefine((cmd, ctx) => {
    // Clients must never send a raw "status" field — TransitionCommand uses toStatus only.
    if ("status" in (cmd as object)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "client_status_forbidden",
      });
    }
  });

export const CreateTransactionInputSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    listingId: z.string().min(1).max(128),
    buyerId: z.string().min(1).max(128),
    sellerId: z.string().min(1).max(128),
    currentPrice: z.number().finite().nonnegative().nullable().optional(),
    currency: z.string().min(1).max(8).optional(),
    /** Creation idempotency — optional. */
    idempotencyKey: z.string().min(8).max(200).optional(),
    vertical: z.enum(VERTICALS).optional(),
    fulfillmentType: z.enum(FULFILLMENT_TYPES).optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    verificationPolicy: z.enum(VERIFICATION_POLICIES).optional(),
    contractValueCents: z.number().int().nonnegative().nullable().optional(),
    platformManagedAmountCents: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.buyerId === input.sellerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "buyer_seller_must_differ",
      });
    }
  });

export const TransactionEventSchema = z
  .object({
    id: z.string().min(1).max(128),
    transactionId: z.string().min(1).max(128),
    actorType: ActorTypeSchema,
    actorId: z.string().min(1).max(128),
    eventType: z.string().min(1).max(64),
    fromStatus: TransactionStatusSchema,
    toStatus: TransactionStatusSchema,
    idempotencyKey: z.string().min(1).max(200),
    payloadJson: z.record(z.unknown()),
    createdAt: z.string().min(10).max(40),
  })
  .strict();

export const TransactionAuditSchema = z
  .object({
    id: z.string().min(1).max(128),
    transactionId: z.string().min(1).max(128),
    sequenceId: z.number().int().positive(),
    eventId: z.string().min(1).max(128),
    stateHash: z.string().min(16).max(128),
    createdAt: z.string().min(10).max(40),
  })
  .strict();

export type VautoTransactionParsed = z.infer<typeof VautoTransactionSchema>;
export type TransitionCommandParsed = z.infer<typeof TransitionCommandSchema>;
export type CreateTransactionInputParsed = z.infer<
  typeof CreateTransactionInputSchema
>;
