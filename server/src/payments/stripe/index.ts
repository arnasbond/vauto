/**
 * Stage 11F.2 — Stripe PaymentIntent Integration 1.0 public exports.
 */

export {
  STRIPE_INTEGRATION_VERSION,
  type StripeIntegrationVersion,
} from "./version.js";

export {
  CreateStripeIntentBodySchema,
  StripeProviderPaymentIntentSchema,
  StripeSafeClientResponseSchema,
} from "./schema.js";

export {
  StripeProviderError,
  StripeProviderTimeoutError,
  type PaymentProvider,
  type StripeProviderPaymentIntent,
  type CreateStripePaymentIntentInput,
  type StripeSafeClientResponse,
} from "./types.js";

export {
  FakeStripeAdapter,
  RealStripeAdapter,
  createPaymentProvider,
  stripeIdempotencyKeyForCreate,
  stripeIdempotencyKeyForSellerTransfer,
  type FakeStripeOptions,
} from "./stripe-adapter.js";

export {
  StripePaymentIntentService,
  createStripePaymentIntentService,
  createTestStripePaymentIntentService,
  STRIPE_PI_MIGRATION_SQL,
  STRIPE_PI_MIGRATION_ID,
} from "./stripe-payment-intent-service.js";

export * from "./webhooks/index.js";
