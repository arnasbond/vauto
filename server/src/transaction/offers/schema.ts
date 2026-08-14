/**
 * Structured Offers 1.0 — Zod strict schemas (integer cents only).
 */

import { z } from "zod";
import { STRUCTURED_OFFERS_VERSION } from "./version.js";
import { OFFER_STATUSES } from "./types.js";

export const OfferStatusSchema = z.enum(OFFER_STATUSES);

/** Reject floats / strings — money must be positive integer cents. */
export const AmountCentsSchema = z
  .number()
  .int("amount_cents_must_be_integer")
  .positive("amount_cents_must_be_positive");

export const CurrencySchema = z.literal("EUR");

export const CreateOfferBodySchema = z
  .object({
    amountCents: AmountCentsSchema,
    currency: CurrencySchema.optional().default("EUR"),
    expiresAt: z.string().min(10).max(40).nullable().optional(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .superRefine((body, ctx) => {
    const forbidden = [
      "status",
      "buyerId",
      "sellerId",
      "createdByUserId",
      "transactionState",
      "amount",
      "price",
      "amountEur",
    ] as const;
    for (const k of forbidden) {
      if (k in (body as Record<string, unknown>)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `client_${k}_forbidden`,
        });
      }
    }
  });

export const CounterOfferBodySchema = z
  .object({
    amountCents: AmountCentsSchema,
    currency: CurrencySchema.optional().default("EUR"),
    expiresAt: z.string().min(10).max(40).nullable().optional(),
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

export const OfferActionBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

export const VautoOfferSchema = z
  .object({
    id: z.string().min(1).max(128),
    transactionId: z.string().min(1).max(128),
    listingId: z.string().min(1).max(128),
    buyerId: z.string().min(1).max(128),
    sellerId: z.string().min(1).max(128),
    createdByUserId: z.string().min(1).max(128),
    parentOfferId: z.string().min(1).max(128).nullable(),
    amountCents: AmountCentsSchema,
    currency: CurrencySchema,
    status: OfferStatusSchema,
    version: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(1).max(200),
    expiresAt: z.string().nullable(),
    offersVersion: z.literal(STRUCTURED_OFFERS_VERSION),
    createdAt: z.string().min(10).max(40),
    updatedAt: z.string().min(10).max(40),
  })
  .strict();

export type CreateOfferBodyParsed = z.infer<typeof CreateOfferBodySchema>;
export type CounterOfferBodyParsed = z.infer<typeof CounterOfferBodySchema>;
export type OfferActionBodyParsed = z.infer<typeof OfferActionBodySchema>;
