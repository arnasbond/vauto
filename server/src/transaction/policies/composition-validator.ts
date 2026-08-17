/**
 * Stage 11J.1 — fail-closed policy composition matrix.
 * Invalid combinations never create a transaction (400).
 */

import {
  InvalidPolicyCompositionError,
  type FulfillmentType,
  type PaymentMode,
  type VerificationPolicy,
  type Vertical,
} from "../types.js";

const ALLOWED: Record<
  Vertical,
  {
    fulfillment: readonly FulfillmentType[];
    payment: readonly PaymentMode[];
    verification: readonly VerificationPolicy[];
  }
> = {
  GOODS: {
    fulfillment: ["CARRIER_DELIVERY", "LOCAL_HANDOFF"],
    payment: ["FULL_ESCROW"],
    verification: ["PLATFORM_TRANSACTION"],
  },
  SERVICES: {
    fulfillment: ["SERVICE_IN_PERSON", "SERVICE_REMOTE"],
    payment: ["DEPOSIT_ESCROW", "FULL_ESCROW"],
    verification: ["PLATFORM_TRANSACTION", "MUTUAL_COMPLETION"],
  },
  REAL_ESTATE: {
    fulfillment: ["DIRECT_CONTACT", "LOCAL_HANDOFF"],
    payment: ["OFF_PLATFORM", "DEPOSIT_ESCROW", "PLATFORM_FEE_ONLY"],
    verification: ["APPOINTMENT_VERIFIED", "NO_VERIFIED_REVIEW"],
  },
  JOBS: {
    fulfillment: ["DIRECT_CONTACT", "SERVICE_REMOTE"],
    payment: ["PLATFORM_FEE_ONLY", "OFF_PLATFORM"],
    verification: [
      "APPOINTMENT_VERIFIED",
      "NO_VERIFIED_REVIEW",
      "MUTUAL_COMPLETION",
    ],
  },
};

export function validateTransactionPolicyComposition(
  vertical: Vertical,
  fulfillment: FulfillmentType,
  payment: PaymentMode,
  verification: VerificationPolicy
): void {
  if (payment === "OFF_PLATFORM" && verification === "PLATFORM_TRANSACTION") {
    throw new InvalidPolicyCompositionError(
      "OFF_PLATFORM cannot be combined with PLATFORM_TRANSACTION"
    );
  }

  const allowed = ALLOWED[vertical];
  if (!allowed) {
    throw new InvalidPolicyCompositionError(`Unknown vertical ${vertical}`);
  }

  const failures: string[] = [];
  if (!allowed.fulfillment.includes(fulfillment)) {
    failures.push(`fulfillment ${fulfillment}`);
  }
  if (!allowed.payment.includes(payment)) {
    failures.push(`payment ${payment}`);
  }
  if (!allowed.verification.includes(verification)) {
    failures.push(`verification ${verification}`);
  }
  if (failures.length > 0) {
    throw new InvalidPolicyCompositionError(
      `Invalid policy composition for ${vertical}: ${failures.join(", ")}`
    );
  }
}
