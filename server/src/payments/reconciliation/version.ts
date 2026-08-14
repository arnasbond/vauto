/**
 * Payment Reconciliation 1.0 version pin (Stage 11F.5).
 * No AI — deterministic classification and repair only.
 */

export const PAYMENT_RECONCILIATION_VERSION = "1.0" as const;
export type PaymentReconciliationVersion =
  typeof PAYMENT_RECONCILIATION_VERSION;
