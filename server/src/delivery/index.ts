/**
 * Stage 11G — Delivery & Shipping public exports (11G.3 durable release).
 */

export {
  DELIVERY_INTEGRATION_VERSION,
  type DeliveryIntegrationVersion,
} from "./version.js";

export {
  DELIVERY_CARRIERS,
  DELIVERY_STATUSES,
  DeliveryAuthError,
  DeliveryStateError,
  DeliveryNotFoundError,
  DeliveryReleaseBlockedError,
  DeliveryCarrierUnavailableError,
  type DeliveryCarrier,
  type DeliveryStatus,
  type CarrierReportedStatus,
  type VautoDelivery,
  type DeliveryResult,
  type CarrierAdapter,
  type ReleaseFundsPort,
} from "./types.js";

export {
  CreateDeliveryLabelBodySchema,
  ConfirmDeliveryBodySchema,
  SyncCarrierStatusBodySchema,
  DeliveryResponseSchema,
} from "./schema.js";

export {
  FakeCarrierAdapter,
  RealOmnivaAdapter,
  RealDpdAdapter,
  RealLpExpressAdapter,
  ProductionFailClosedCarrier,
  createCarrierAdapter,
  resolveDefaultCarrierAdapter,
  assertCarrierUsableInEnvironment,
  toPersistedDeliveryStatus,
} from "./carrier-adapter.js";

export { DeliveryRepository } from "./delivery-repository.js";

export {
  DeliveryService,
  createDeliveryService,
  createTestDeliveryService,
  setDeliveryCarrierOverride,
  DELIVERY_MIGRATION_SQL,
  DELIVERY_MIGRATION_ID,
  DELIVERY_HARDENING_MIGRATION_SQL,
  DELIVERY_HARDENING_MIGRATION_ID,
  DURABLE_RELEASE_MIGRATION_SQL,
  DURABLE_RELEASE_MIGRATION_ID,
  STALE_RELEASE_RECOVERY_MIGRATION_SQL,
  STALE_RELEASE_RECOVERY_MIGRATION_ID,
} from "./delivery-service.js";

export { createFundsReleasePort } from "./funds-release-port.js";

export {
  checkReleaseEligibility,
  assertReleaseEligibility,
  checkPayoutSafetyGates,
  assertPayoutSafetyGates,
} from "./release-eligibility.js";

export {
  isMonotonicDeliveryTransition,
  assertMonotonicDeliveryTransition,
  isPhysicalScanStatus,
} from "./status-monotonic.js";

export {
  SellerReleaseJobRepository,
  processSellerReleaseJobs,
  startScheduledSellerReleaseWorker,
  stopScheduledSellerReleaseWorkerForTests,
  releaseBackoffSeconds,
  MAX_SELLER_RELEASE_ATTEMPTS,
  STALE_PROCESSING_LEASE_MS,
  type SellerReleaseJob,
  type SellerReleaseJobStatus,
} from "./seller-release-jobs.js";
