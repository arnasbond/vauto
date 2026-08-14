/**
 * Stage 11F.2 — Zod strict schemas for Stripe PaymentIntent HTTP.
 * Client may send ONLY idempotencyKey.
 */

import { z } from "zod";
import { STRIPE_INTEGRATION_VERSION } from "./version.js";

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
  "snapshotId",
  "dealSnapshotId",
  "deal_snapshot_id",
  "transactionId",
  "transaction_id",
  "stripePaymentIntentId",
  "clientSecret",
] as const;

export const CreateStripeIntentBodySchema = z
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

export const StripeProviderPaymentIntentSchema = z
  .object({
    id: z.string().min(1).max(200),
    clientSecret: z.string().min(1).max(500),
    status: z.string().min(1).max(64),
    amountCents: z.number().int().positive(),
    currency: z.literal("eur"),
  })
  .strict();

export const StripeSafeClientResponseSchema = z
  .object({
    clientSecret: z.string().min(1),
    stripePaymentIntentId: z.string().min(1),
    status: z.string().min(1),
    amountCents: z.number().int().positive(),
    currency: z.literal("EUR"),
    idempotentReplay: z.boolean(),
    stripeIntegrationVersion: z.literal(STRIPE_INTEGRATION_VERSION),
  })
  .strict();
