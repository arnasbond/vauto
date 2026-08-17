import type { PaymentPolicy } from "../types.js";

export const PlatformFeePolicy: PaymentPolicy = {
  id: "PLATFORM_FEE_ONLY",
  resolveManagedAmountCents(input) {
    const requested = input.requestedManagedCents ?? 0;
    const contract = input.contractValueCents;
    if (requested < 0) return 0;
    if (contract != null && requested > contract) return contract;
    return requested;
  },
};

export const OffPlatformPolicy: PaymentPolicy = {
  id: "OFF_PLATFORM",
  resolveManagedAmountCents() {
    return 0;
  },
};
