import type { VautoTransaction } from "../../types.js";
import type {
  PlatformPaymentEvidence,
  ReviewEligibilityPolicy,
  ReviewVerificationLevel,
} from "../types.js";

function isParty(tx: VautoTransaction, actorUserId: string): boolean {
  return tx.buyerId === actorUserId || tx.sellerId === actorUserId;
}

function hasPlatformFunds(tx: VautoTransaction): boolean {
  return (
    tx.paymentMode !== "OFF_PLATFORM" &&
    (tx.platformManagedAmountCents ?? 0) > 0
  );
}

function qualifiesForL1(
  tx: VautoTransaction,
  evidence?: PlatformPaymentEvidence
): boolean {
  if (tx.status !== "COMPLETED") return false;
  if (tx.paymentMode === "OFF_PLATFORM") return false;
  if (!hasPlatformFunds(tx)) return false;
  if (!evidence?.hasSuccessfulPlatformPayment) return false;
  const policy = tx.verificationPolicy ?? "PLATFORM_TRANSACTION";
  if (policy === "NO_VERIFIED_REVIEW") return false;
  if (policy === "APPOINTMENT_VERIFIED") return false;
  return policy === "PLATFORM_TRANSACTION" || policy === "MUTUAL_COMPLETION";
}

export const DefaultReviewEligibilityPolicy: ReviewEligibilityPolicy = {
  canSubmit(tx, actorUserId) {
    if (!isParty(tx, actorUserId)) return false;
    const policy = tx.verificationPolicy ?? "PLATFORM_TRANSACTION";
    if (policy === "NO_VERIFIED_REVIEW") return false;
    if (policy === "APPOINTMENT_VERIFIED" || policy === "MUTUAL_COMPLETION") {
      return tx.status === "INTERACTION_COMPLETED" || tx.status === "COMPLETED";
    }
    return tx.status === "COMPLETED";
  },
  verificationLevel(tx, evidence?): ReviewVerificationLevel {
    const policy = tx.verificationPolicy ?? "PLATFORM_TRANSACTION";
    if (policy === "NO_VERIFIED_REVIEW") return "L0_UNVERIFIED";
    if (qualifiesForL1(tx, evidence)) return "L1_PLATFORM_TRANSACTION";
    if (policy === "APPOINTMENT_VERIFIED") return "L2_INTERACTION";
    if (policy === "MUTUAL_COMPLETION") return "L2_INTERACTION";
    if (tx.paymentMode === "OFF_PLATFORM" || !hasPlatformFunds(tx)) {
      return "L2_INTERACTION";
    }
    if (!evidence?.hasSuccessfulPlatformPayment) return "L2_INTERACTION";
    return "L2_INTERACTION";
  },
};

export function resolveReviewEligibilityPolicy(): ReviewEligibilityPolicy {
  return DefaultReviewEligibilityPolicy;
}
