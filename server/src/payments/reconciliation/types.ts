/**
 * Stage 11F.5 — Reconciliation types (no Stripe PII in operator reports).
 */

import type { PAYMENT_RECONCILIATION_VERSION } from "./version.js";

export const DISCREPANCY_CLASSES = [
  "IN_SYNC",
  "RECOVERABLE_DRIFT",
  "MANUAL_REVIEW",
  "SECURITY_MISMATCH",
] as const;

export type DiscrepancyClass = (typeof DISCREPANCY_CLASSES)[number];

export const INVARIANT_IDS = [
  "SNAPSHOT_EQ_OFFER",
  "GROSS_EQ_SNAPSHOT",
  "GROSS_EQ_FEE_PLUS_NET",
  "STRIPE_CHARGE_EQ_GROSS",
  "TRANSFER_EQ_SELLER_NET",
  "REFUND_LEQ_CAPTURED",
  "REVERSAL_LEQ_TRANSFERRED",
  "LEDGER_CONSERVATION",
] as const;

export type InvariantId = (typeof INVARIANT_IDS)[number];

export type InvariantCheckResult = {
  id: InvariantId;
  ok: boolean;
  detail: string;
};

export type DiscrepancyFinding = {
  paymentIntentId: string;
  transactionId: string;
  classification: DiscrepancyClass;
  invariantId: InvariantId | null;
  code: string;
  message: string;
  safeAutoHeal: boolean;
};

export type AutoRepairAction = {
  paymentIntentId: string;
  action: string;
  applied: boolean;
  reason: string;
};

export type ReconciliationReport = {
  paymentReconciliationVersion: typeof PAYMENT_RECONCILIATION_VERSION;
  reconciledAt: string;
  scanned: number;
  inSync: number;
  discrepancies: DiscrepancyFinding[];
  autoRepairsApplied: AutoRepairAction[];
  manualReviewRequired: number;
  securityMismatches: number;
};

export type ProviderMirror = {
  paymentIntentId: string | null;
  amountCents: number | null;
  currency: string | null;
  status: string | null;
  transferId: string | null;
  transferAmountCents: number | null;
  refundId: string | null;
  refundAmountCents: number | null;
  reversalAmountCents: number | null;
};

export type ReconcileSubject = {
  paymentIntentId: string;
  transactionId: string;
  snapshotAmountCents: number;
  offerAmountCents: number;
  grossAmountCents: number;
  platformFeeCents: number;
  sellerNetCents: number;
  transferStatus: string;
  status: string;
  stripePaymentIntentId: string | null;
  stripeTransferId: string | null;
  stripeRefundId: string | null;
  ledgerDebitSum: number;
  ledgerCreditSum: number;
  ledgerFeeSum: number;
  unreleasedEscrowCents: number;
  provider: ProviderMirror | null;
};
