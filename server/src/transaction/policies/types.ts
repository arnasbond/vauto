/**
 * Stage 11J — policy contracts. One state machine, declarative composition.
 * vertical ≠ fulfillment_type (a service may still use deposit escrow).
 */

import type { TransitionEdge } from "../transition-matrix.js";
import type {
  ActorType,
  FulfillmentType,
  PaymentMode,
  ReasonCode,
  TransactionStatus,
  VautoTransaction,
  VerificationPolicy,
  Vertical,
} from "../types.js";
import { LEGACY_TRANSACTION_POLICY } from "../types.js";

export type PolicyContext = {
  vertical: Vertical;
  fulfillmentType: FulfillmentType;
  paymentMode: PaymentMode;
  verificationPolicy: VerificationPolicy;
  contractValueCents: number | null;
  platformManagedAmountCents: number;
};

export function policyContextFromTx(tx: VautoTransaction): PolicyContext {
  return {
    vertical: tx.vertical ?? LEGACY_TRANSACTION_POLICY.vertical,
    fulfillmentType:
      tx.fulfillmentType ?? LEGACY_TRANSACTION_POLICY.fulfillmentType,
    paymentMode: tx.paymentMode ?? LEGACY_TRANSACTION_POLICY.paymentMode,
    verificationPolicy:
      tx.verificationPolicy ?? LEGACY_TRANSACTION_POLICY.verificationPolicy,
    contractValueCents:
      tx.contractValueCents ?? LEGACY_TRANSACTION_POLICY.contractValueCents,
    platformManagedAmountCents:
      tx.platformManagedAmountCents ??
      LEGACY_TRANSACTION_POLICY.platformManagedAmountCents,
  };
}

export interface FulfillmentPolicy {
  readonly id: FulfillmentType;
  findEdge(
    from: TransactionStatus,
    to: TransactionStatus,
    actorType: ActorType
  ): TransitionEdge | null;
  /** Seller/provider cannot mark COMPLETED without the counterparty. */
  forbidsUnauthenticatedCompletion(
    from: TransactionStatus,
    to: TransactionStatus,
    actorType: ActorType
  ): boolean;
}

export interface PaymentPolicy {
  readonly id: PaymentMode;
  /** Sole platform-deposit ceiling (cents). Off-platform remainder is not ledgered. */
  resolveManagedAmountCents(input: {
    contractValueCents: number | null;
    requestedManagedCents: number | null;
  }): number;
}

export const REVIEW_VERIFICATION_LEVELS = [
  "L1_PLATFORM_TRANSACTION",
  "L2_INTERACTION",
  "L3_CONTRACT",
  "L0_UNVERIFIED",
] as const;
export type ReviewVerificationLevel =
  (typeof REVIEW_VERIFICATION_LEVELS)[number];

export interface ReviewEligibilityPolicy {
  canSubmit(tx: VautoTransaction, actorUserId: string): boolean;
  verificationLevel(
    tx: VautoTransaction,
    evidence?: PlatformPaymentEvidence
  ): ReviewVerificationLevel;
}

/** Evidence that platform funds actually moved and were provider-verified. */
export type PlatformPaymentEvidence = {
  hasSuccessfulPlatformPayment: boolean;
};

export type { ReasonCode };
