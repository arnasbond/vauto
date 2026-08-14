/**
 * Stripe PaymentIntent Integration 1.0 version pin (Stage 11F.2).
 * No webhooks / PAID transitions in this stage.
 */

export const STRIPE_INTEGRATION_VERSION = "1.0" as const;
export type StripeIntegrationVersion = typeof STRIPE_INTEGRATION_VERSION;
