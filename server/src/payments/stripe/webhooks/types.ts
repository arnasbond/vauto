/**
 * Stage 11F.3 — Stripe webhook domain types.
 */

import type { STRIPE_WEBHOOKS_VERSION } from "./version.js";

export const WEBHOOK_INBOX_STATUSES = [
  "PENDING",
  "PROCESSED",
  "FAILED",
] as const;

export type WebhookInboxStatus = (typeof WEBHOOK_INBOX_STATUSES)[number];

export const STRIPE_WEBHOOK_ALLOWLIST = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.processing",
  "charge.refunded",
  "refund.updated",
] as const;

export type StripeWebhookAllowlistedType =
  (typeof STRIPE_WEBHOOK_ALLOWLIST)[number];

export type WebhookInboxRow = {
  id: string;
  stripeEventId: string;
  eventType: string;
  stripeObjectId: string;
  status: WebhookInboxStatus;
  payloadHash: string;
  attempts: number;
  lastError: string | null;
  livemode: boolean | null;
  createdAt: string;
  processedAt: string | null;
};

export type WebhookHandleResult = {
  ok: true;
  outcome:
    | "processed"
    | "duplicate"
    | "ignored_unknown_type"
    | "noop_monotonic"
    | "failed_reconciliation";
  stripeEventId: string;
  stripeWebhooksVersion: typeof STRIPE_WEBHOOKS_VERSION;
};

export class StripeWebhookSignatureError extends Error {
  readonly code = "STRIPE_WEBHOOK_SIGNATURE_INVALID" as const;
  readonly httpStatus = 400;
  constructor(message = "Invalid Stripe webhook signature") {
    super(message);
    this.name = "StripeWebhookSignatureError";
  }
}

export class StripeWebhookConfigError extends Error {
  readonly code = "STRIPE_WEBHOOK_NOT_CONFIGURED" as const;
  readonly httpStatus = 503;
  constructor(message = "Stripe webhook secret not configured") {
    super(message);
    this.name = "StripeWebhookConfigError";
  }
}
