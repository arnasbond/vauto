/**
 * Stage 11F.3 — Zod schemas for Stripe webhook PaymentIntent objects.
 */

import { z } from "zod";
import { STRIPE_WEBHOOK_ALLOWLIST } from "./types.js";
import { STRIPE_WEBHOOKS_VERSION } from "./version.js";

export const StripeWebhookAllowlistSchema = z.enum(STRIPE_WEBHOOK_ALLOWLIST);

export const StripePaymentIntentObjectSchema = z
  .object({
    id: z.string().min(1),
    object: z.literal("payment_intent").optional(),
    amount: z.number().int().positive(),
    currency: z.string().min(3).max(8),
    status: z.string().min(1),
    metadata: z.record(z.string()).optional().default({}),
    livemode: z.boolean().optional(),
  })
  .passthrough();

export const WebhookHandleResultSchema = z
  .object({
    ok: z.literal(true),
    outcome: z.enum([
      "processed",
      "duplicate",
      "ignored_unknown_type",
      "noop_monotonic",
      "failed_reconciliation",
    ]),
    stripeEventId: z.string().min(1),
    stripeWebhooksVersion: z.literal(STRIPE_WEBHOOKS_VERSION),
  })
  .strict();
