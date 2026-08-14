/**
 * Payment Domain & Ledger 1.0 — public exports (Stage 11F.1).
 * No external Stripe / PSP API execution in this stage.
 */

export {
  PAYMENT_LEDGER_VERSION,
  type PaymentLedgerVersion,
} from "./version.js";

export {
  PAYMENT_INTENT_STATUSES,
  PAYMENT_TERMINAL_STATUSES,
  LEDGER_ENTRY_TYPES,
  TRANSFER_STATUSES,
  PaymentAuthError,
  PaymentNotFoundError,
  PaymentStateError,
  FinancialReconciliationError,
  PaymentIdempotencyConflictError,
  PaymentVersionConflictError,
  type PaymentIntentStatus,
  type PaymentTerminalStatus,
  type LedgerEntryType,
  type TransferStatus,
  type PaymentIntent,
  type PaymentLedgerEntry,
  type CreatePaymentIntentResult,
  type GetPaymentIntentResult,
} from "./types.js";

export {
  CreatePaymentIntentBodySchema,
  PaymentIntentSchema,
  PaymentLedgerEntrySchema,
  CreatePaymentIntentResultSchema,
  AmountCentsSchema,
  CurrencySchema,
} from "./schema.js";

export {
  reconcileSnapshotAgainstAcceptedOffer,
  type ReconciliationFacts,
} from "./reconciliation-service.js";

export {
  computeLedgerEntryHash,
  appendLedgerEntry,
  listLedgerForIntent,
  getLatestRunningBalance,
  mapLedgerRow,
} from "./ledger-service.js";

export {
  PaymentRepository,
  PAYMENT_LEDGER_MIGRATION_SQL,
  PAYMENT_LEDGER_MIGRATION_ID,
  mapIntentRow,
} from "./repository.js";

export {
  PaymentIntentService,
  createPaymentIntentService,
} from "./payment-intent-service.js";
