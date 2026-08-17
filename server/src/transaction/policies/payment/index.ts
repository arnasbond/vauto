import type { PaymentMode } from "../../types.js";
import type { PaymentPolicy } from "../types.js";
import { DepositEscrowPolicy } from "./deposit-escrow-policy.js";
import { FullEscrowPolicy } from "./full-escrow-policy.js";
import { OffPlatformPolicy, PlatformFeePolicy } from "./platform-fee-policy.js";

export { DepositEscrowPolicy, DepositEscrowPolicyError } from "./deposit-escrow-policy.js";
export { FullEscrowPolicy } from "./full-escrow-policy.js";
export { OffPlatformPolicy, PlatformFeePolicy } from "./platform-fee-policy.js";

export function resolvePaymentPolicy(mode: PaymentMode): PaymentPolicy {
  switch (mode) {
    case "DEPOSIT_ESCROW":
      return DepositEscrowPolicy;
    case "PLATFORM_FEE_ONLY":
      return PlatformFeePolicy;
    case "OFF_PLATFORM":
      return OffPlatformPolicy;
    case "FULL_ESCROW":
    default:
      return FullEscrowPolicy;
  }
}
