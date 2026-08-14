/**
 * Stage 11F.4 — Zod strict bodies for release / refund.
 * Client may send ONLY idempotencyKey.
 */

import { z } from "zod";
import { FUNDS_TRANSFER_VERSION } from "./version.js";

const CLIENT_FORBIDDEN = [
  "amount",
  "amountCents",
  "transferAmount",
  "platformFee",
  "platformFeeCents",
  "sellerNet",
  "sellerNetCents",
  "destinationAccountId",
  "sellerStripeAccountId",
  "currency",
  "sellerId",
  "status",
  "stripeTransferId",
] as const;

function forbidClientMoneyFields(
  body: Record<string, unknown>,
  ctx: z.RefinementCtx
) {
  for (const k of CLIENT_FORBIDDEN) {
    if (k in body) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `client_${k}_forbidden`,
      });
    }
  }
}

export const ReleaseToSellerBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .superRefine((body, ctx) =>
    forbidClientMoneyFields(body as Record<string, unknown>, ctx)
  );

export const RefundToBuyerBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .superRefine((body, ctx) =>
    forbidClientMoneyFields(body as Record<string, unknown>, ctx)
  );

export const FundsTransferResultSchema = z
  .object({
    paymentIntentId: z.string().min(1),
    transactionId: z.string().min(1),
    transferStatus: z.enum([
      "NOT_STARTED",
      "TRANSFER_PENDING",
      "TRANSFER_EXECUTING",
      "TRANSFERRED",
      "TRANSFER_BLOCKED",
      "REFUND_PENDING",
      "REFUNDED",
    ]),
    status: z.string().min(1),
    grossAmountCents: z.number().int().positive(),
    platformFeeCents: z.number().int().nonnegative(),
    sellerNetCents: z.number().int().nonnegative(),
    stripeTransferId: z.string().nullable(),
    stripeRefundId: z.string().nullable(),
    messageLt: z.string().nullable(),
    idempotentReplay: z.boolean(),
    fundsTransferVersion: z.literal(FUNDS_TRANSFER_VERSION),
  })
  .strict();
