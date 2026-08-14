/**
 * Stage 11H.2 — Dispute Resolution public exports.
 */

export {
  DISPUTE_ENGINE_VERSION,
  type DisputeEngineVersion,
} from "./version.js";

export {
  DISPUTE_REASONS,
  DISPUTE_STATUSES,
  DISPUTE_RESOLUTIONS,
  DISPUTE_OPEN_ELIGIBLE_STATUSES,
  DisputeAuthError,
  DisputeStateError,
  DisputeNotFoundError,
  DisputeAdminRequiredError,
  type DisputeReason,
  type DisputeStatus,
  type DisputeResolution,
  type DisputeEvidence,
  type DisputeFundsPort,
  type DisputeFundsAction,
  type VautoDispute,
  type DisputeResult,
} from "./types.js";

export {
  OpenDisputeBodySchema,
  ResolveDisputeBodySchema,
  DisputeEvidenceSchema,
  DisputeResponseSchema,
} from "./schema.js";

export { DisputeRepository } from "./dispute-repository.js";

export {
  DisputeService,
  createDisputeService,
  DISPUTE_MIGRATION_SQL,
  DISPUTE_MIGRATION_ID,
  DISPUTE_FINALITY_MIGRATION_SQL,
  DISPUTE_FINALITY_MIGRATION_ID,
} from "./dispute-service.js";

export {
  DisputeFinancialJobRepository,
  processDisputeFinancialJobs,
  startScheduledDisputeFinancialWorker,
  MAX_DISPUTE_FINANCIAL_ATTEMPTS,
} from "./dispute-financial-jobs.js";

export { createDisputeFundsPort } from "./funds-port.js";
