/**
 * Stage 11F.3 — Stripe Signed Webhooks 1.0 public exports.
 */

export {
  STRIPE_WEBHOOKS_VERSION,
  type StripeWebhooksVersion,
} from "./version.js";

export {
  WEBHOOK_INBOX_STATUSES,
  STRIPE_WEBHOOK_ALLOWLIST,
  StripeWebhookSignatureError,
  StripeWebhookConfigError,
  type WebhookInboxStatus,
  type StripeWebhookAllowlistedType,
  type WebhookInboxRow,
  type WebhookHandleResult,
} from "./types.js";

export {
  StripeWebhookAllowlistSchema,
  StripePaymentIntentObjectSchema,
  WebhookHandleResultSchema,
} from "./schema.js";

export {
  verifyStripeWebhookSignature,
  generateTestStripeSignatureHeader,
  assertRawBodyUnmodified,
  isSignatureVerifiedStripeEvent,
  type VerifiedStripeEvent,
} from "./signature-verifier.js";

export {
  WebhookInboxRepository,
  hashWebhookPayload,
  mapInboxRow,
  STRIPE_WEBHOOKS_MIGRATION_SQL,
  STRIPE_WEBHOOKS_MIGRATION_ID,
} from "./inbox-repository.js";

export {
  StripeWebhookProcessor,
  createStripeWebhookProcessor,
  type WebhookProcessorDeps,
} from "./webhook-processor.js";

export {
  mintTrustedProviderProvenanceFromSignedWebhook,
  applyTrustedProviderProvenance,
  applyTrustedProviderProvenanceInTx,
  isMintedTrustedProviderProvenance,
  type TrustedProviderProvenance,
} from "./trusted-provider-provenance.js";
