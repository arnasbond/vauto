/**
 * Stage 11F.4 — Funds Transfer public exports.
 */

export {
  FUNDS_TRANSFER_VERSION,
  type FundsTransferVersion,
} from "./version.js";

export {
  TransferBlockedError,
  FundsTransferAuthError,
  FundsTransferForbiddenError,
  FundsTransferStateError,
  REFUND_AUTHORITIES,
  type FeeSplit,
  type FundsTransferResult,
  type RefundAuthority,
  type SellerConnectPort,
} from "./types.js";

export {
  ReleaseToSellerBodySchema,
  RefundToBuyerBodySchema,
  FundsTransferResultSchema,
} from "./schema.js";

export {
  PLATFORM_FEE_PERCENT,
  calculatePlatformFeeSplit,
  assertFeeSplitInvariant,
} from "./fee-calculator.js";

export {
  FundsTransferService,
  createFundsTransferService,
  createTestFundsTransferService,
  setSellerConnectOverride,
  finalizeBuyerRefundFromProvider,
  FUNDS_TRANSFER_MIGRATION_SQL,
  FUNDS_TRANSFER_MIGRATION_ID,
  REFUND_PENDING_MIGRATION_SQL,
  REFUND_PENDING_MIGRATION_ID,
  IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL,
  IN_FLIGHT_TRANSFER_LOCK_MIGRATION_ID,
} from "./funds-transfer-service.js";
