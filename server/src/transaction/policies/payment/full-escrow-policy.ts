import type { PaymentPolicy } from "../types.js";

export const FullEscrowPolicy: PaymentPolicy = {
  id: "FULL_ESCROW",
  resolveManagedAmountCents(input) {
    const contract = input.contractValueCents ?? 0;
    if (contract < 0) return 0;
    return contract;
  },
};
