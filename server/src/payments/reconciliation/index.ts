/**
 * Stage 11F.5 — Financial Reconciliation public exports.
 */

export {
  PAYMENT_RECONCILIATION_VERSION,
  type PaymentReconciliationVersion,
} from "./version.js";

export {
  DISCREPANCY_CLASSES,
  INVARIANT_IDS,
  type DiscrepancyClass,
  type InvariantId,
  type InvariantCheckResult,
  type DiscrepancyFinding,
  type AutoRepairAction,
  type ReconciliationReport,
  type ProviderMirror,
  type ReconcileSubject,
} from "./types.js";

export {
  DiscrepancyClassSchema,
  InvariantIdSchema,
  DiscrepancyFindingSchema,
  AutoRepairActionSchema,
  ReconciliationReportSchema,
} from "./schema.js";

export { checkAllInvariants, allInvariantsOk } from "./invariants.js";

export {
  classifySubject,
  classifyInvariantFailure,
  detectRecoverableProviderLinkDrift,
} from "./discrepancy-classifier.js";

export { applySafeRepairs, type RepairPort } from "./repair-policy.js";

export {
  loadReconcileSubject,
  reconcilePaymentIntent,
  reconcileBatch,
  type ProviderLookup,
  type ProviderLookupContext,
} from "./reconciler.js";

export {
  runBoundedReconciliationWorker,
  type ReconciliationWorkerOptions,
} from "./reconciliation-worker.js";

export {
  startScheduledReconciliationWorker,
  stopScheduledReconciliationWorkerForTests,
} from "./scheduled-worker.js";

export {
  createLiveStripeProviderLookup,
  createFakeStripeProviderLookup,
  createProductionProviderLookup,
  createDbRepairPort,
} from "./stripe-provider-lookup.js";
