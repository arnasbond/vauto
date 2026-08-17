/**
 * Transaction State Machine 1.0 — public API (Stage 11A).
 * No HTTP / UI / Stripe in this stage.
 */

export {
  TRANSACTION_STATE_MACHINE_VERSION,
  type TransactionStateMachineVersion,
} from "./version.js";

export {
  TRANSACTION_STATUSES,
  HAPPY_PATH_STATUSES,
  TERMINAL_STATUSES,
  ACTOR_TYPES,
  REASON_CODES,
  InvalidTransitionError,
  VersionConflictError,
  TransactionNotFoundError,
  IdempotencyConflictError,
  PolicyForbiddenError,
  InvalidPolicyCompositionError,
  LEGACY_TRANSACTION_POLICY,
  VERTICALS,
  FULFILLMENT_TYPES,
  PAYMENT_MODES,
  VERIFICATION_POLICIES,
  type TransactionStatus,
  type TerminalStatus,
  type ActorType,
  type ReasonCode,
  type Vertical,
  type FulfillmentType,
  type PaymentMode,
  type VerificationPolicy,
  type VautoTransaction,
  type TransitionCommand,
  type TransitionResult,
  type TransactionEventRecord,
  type TransactionAuditRecord,
} from "./types.js";

export {
  TransactionStatusSchema,
  ActorTypeSchema,
  ReasonCodeSchema,
  VautoTransactionSchema,
  TransitionCommandSchema,
  CreateTransactionInputSchema,
  TransactionEventSchema,
  TransactionAuditSchema,
} from "./schema.js";

export {
  TRANSITION_MATRIX,
  listAllowedTargets,
  findTransitionEdge,
  isTerminalStatus,
  type TransitionEdge,
} from "./transition-matrix.js";

export {
  assertTransitionAllowed,
  applyTransitionPure,
  computeStateHash,
  computeIdempotencyFingerprint,
  type ValidatedTransition,
} from "./state-machine.js";

export {
  buildAuditRecord,
  verifyAuditChain,
  type AuditAppendInput,
} from "./audit-logger.js";

export {
  TransactionRepository,
  createTransactionRepository,
  TRANSACTION_MIGRATION_SQL,
  TRANSACTION_MIGRATION_ID,
  computeCreateIdempotencyFingerprint,
  type TxQueryable,
  type CreateTransactionInput,
} from "./repository.js";

export {
  createPoolTxQueryable,
  createPoolTxQueryableFromPool,
  runQueryableTransaction,
  wrapClientAsQueryable,
  setTxQueryableOverride,
} from "./tx-connection.js";

export * from "./offers/index.js";
export * from "./policies/index.js";
