/**
 * Stripe Signed Webhooks 1.0 version pin (Stage 11F.3).
 * No payout / release / refund execution in this stage.
 */

export const STRIPE_WEBHOOKS_VERSION = "1.0" as const;
export type StripeWebhooksVersion = typeof STRIPE_WEBHOOKS_VERSION;
