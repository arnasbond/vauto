/**
 * Stage 11F.4 — Funds transfer / refund types.
 */

import type { FUNDS_TRANSFER_VERSION } from "./version.js";
import type { TransferStatus } from "../../payment/types.js";

export type FeeSplit = {
  grossAmountCents: number;
  platformFeeCents: number;
  sellerNetCents: number;
};

export type FundsTransferResult = {
  paymentIntentId: string;
  transactionId: string;
  transferStatus: TransferStatus;
  status: string;
  grossAmountCents: number;
  platformFeeCents: number;
  sellerNetCents: number;
  stripeTransferId: string | null;
  stripeRefundId: string | null;
  messageLt: string | null;
  idempotentReplay: boolean;
  fundsTransferVersion: typeof FUNDS_TRANSFER_VERSION;
};

export class TransferBlockedError extends Error {
  readonly code = "TRANSFER_BLOCKED" as const;
  readonly httpStatus = 422;
  readonly messageLt =
    "Pardavėjas turi užbaigti mokėjimų paskyros patvirtinimą.";
  constructor(message = "Seller Stripe Connect onboarding incomplete") {
    super(message);
    this.name = "TransferBlockedError";
  }
}

export class FundsTransferAuthError extends Error {
  readonly code = "FUNDS_TRANSFER_FORBIDDEN" as const;
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "FundsTransferAuthError";
  }
}

/** Stage 11F.6 C-02 — buyer self-refund blocked (explicit 403). */
export class FundsTransferForbiddenError extends Error {
  readonly code = "REFUND_FORBIDDEN" as const;
  readonly httpStatus = 403;
  constructor(
    message = "Buyer cannot initiate refund; admin/system/dispute only"
  ) {
    super(message);
    this.name = "FundsTransferForbiddenError";
  }
}

export class FundsTransferStateError extends Error {
  readonly code = "FUNDS_TRANSFER_INVALID_STATE" as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = "FundsTransferStateError";
  }
}

/** Privileged refund authorities — never BUYER self-serve. */
export const REFUND_AUTHORITIES = [
  "SYSTEM",
  "ADMIN",
  "DISPUTE_ENGINE",
  "MUTUAL_CANCEL",
] as const;

export type RefundAuthority = (typeof REFUND_AUTHORITIES)[number];

export type SellerConnectPort = {
  getSellerStripeAccountId(sellerId: string): Promise<string | null>;
};
