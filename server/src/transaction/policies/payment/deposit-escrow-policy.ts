import type { PaymentPolicy } from "../types.js";

export class DepositEscrowPolicyError extends Error {
  readonly code = "DEPOSIT_ESCROW_INVALID" as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = "DepositEscrowPolicyError";
  }
}

/** Partial deposit through the platform; remainder stays off-platform. */
export const DepositEscrowPolicy: PaymentPolicy = {
  id: "DEPOSIT_ESCROW",
  resolveManagedAmountCents(input) {
    const contract = input.contractValueCents ?? 0;
    const requested = input.requestedManagedCents ?? 0;
    if (contract <= 0) {
      throw new DepositEscrowPolicyError("Deposit escrow requires contract_value_cents");
    }
    if (requested <= 0) {
      throw new DepositEscrowPolicyError("Deposit must be > 0");
    }
    if (requested >= contract) {
      throw new DepositEscrowPolicyError(
        "Deposit must be less than contract value (use FULL_ESCROW for the full amount)"
      );
    }
    return requested;
  },
};
