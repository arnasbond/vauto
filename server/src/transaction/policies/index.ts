import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export * from "./types.js";
export { validateTransactionPolicyComposition } from "./composition-validator.js";
export {
  DirectContactPolicy,
  assertDirectContactCounterparty,
} from "./direct-contact-policy.js";
export { ServiceRemotePolicy } from "./service-remote-policy.js";
export {
  resolveFulfillmentPolicy,
  CarrierDeliveryPolicy,
  LocalHandoffPolicy,
  ServiceInPersonPolicy,
} from "./fulfillment/index.js";
export {
  resolvePaymentPolicy,
  FullEscrowPolicy,
  DepositEscrowPolicy,
  DepositEscrowPolicyError,
  PlatformFeePolicy,
  OffPlatformPolicy,
} from "./payment/index.js";
export {
  DefaultReviewEligibilityPolicy,
  resolveReviewEligibilityPolicy,
} from "./review/review-eligibility-policy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UNIVERSAL_CORE_MIGRATION_ID = "058_universal_transaction_core_11j";
export const UNIVERSAL_CORE_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../migrations/058_universal_transaction_core_11j.sql"
  ),
  "utf8"
);

export const UNIVERSAL_CORE_11J1_MIGRATION_ID =
  "059_universal_transaction_core_11j1";
export const UNIVERSAL_CORE_11J1_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../migrations/059_universal_transaction_core_11j1.sql"
  ),
  "utf8"
);

export const UNIVERSAL_CORE_11J2_MIGRATION_ID =
  "060_universal_transaction_core_11j2";
export const UNIVERSAL_CORE_11J2_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../migrations/060_universal_transaction_core_11j2.sql"
  ),
  "utf8"
);

export const UNIVERSAL_CORE_11J3_MIGRATION_ID =
  "061_universal_transaction_core_11j3";
export const UNIVERSAL_CORE_11J3_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../migrations/061_universal_transaction_core_11j3.sql"
  ),
  "utf8"
);
