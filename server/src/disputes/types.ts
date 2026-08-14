/**
 * Stage 11H.2 — Dispute domain types (decision ≠ financial finality).
 */

import type { DISPUTE_ENGINE_VERSION } from "./version.js";

export const DISPUTE_REASONS = [
  "ITEM_NOT_RECEIVED",
  "DAMAGED",
  "NOT_AS_DESCRIBED",
  "OTHER",
] as const;

export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "DECIDED_BUYER_REFUND",
  "DECIDED_SELLER_PAYOUT",
  "RESOLVED_BUYER_REFUND",
  "RESOLVED_SELLER_PAYOUT",
  "CANCELLED",
] as const;

export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_RESOLUTIONS = [
  "RESOLVE_BUYER_REFUND",
  "RESOLVE_SELLER_PAYOUT",
] as const;

export type DisputeResolution = (typeof DISPUTE_RESOLUTIONS)[number];

/** Statuses from which a party may open a dispute (inspection window). */
export const DISPUTE_OPEN_ELIGIBLE_STATUSES = [
  "SHIPPED",
  "DELIVERED",
] as const;

export type FundsFreezeState =
  | "TRANSFER_BLOCKED"
  | "TRANSFER_IN_FLIGHT"
  | "TRANSFER_ALREADY_EXECUTED"
  | "NONE";

export type DisputeEvidence = {
  vautoDealSnapshotId: string | null;
  trackingCode: string | null;
  /** SHA-256 over ordered message id:text pairs (full transcript). */
  fullChatCanonicalHash: string | null;
  /** SHA-256 over snapshot + tracking + chat + freeze + opened status. */
  evidenceManifestHash: string | null;
  lastChatMessageId: string | null;
  lastChatMessageHash: string | null;
  fundsFreezeState: FundsFreezeState;
  openedAtTransactionStatus: string;
  disputeEngineVersion: typeof DISPUTE_ENGINE_VERSION;
};

export type VautoDispute = {
  id: string;
  transactionId: string;
  openedByUserId: string;
  reason: DisputeReason;
  description: string;
  evidenceJson: DisputeEvidence | null;
  status: DisputeStatus;
  resolutionNotes: string | null;
  resolvedByUserId: string | null;
  disputeEngineVersion: typeof DISPUTE_ENGINE_VERSION;
  createdAt: string;
  resolvedAt: string | null;
};

export type DisputeFundsAction =
  | "NONE"
  | "REFUND"
  | "RELEASE"
  | "FINANCIAL_ACTION_PENDING"
  | "MANUAL_REVIEW";

export type DisputeFundsPort = {
  releaseToSeller(input: {
    transactionId: string;
    actorUserId: string;
    body: { idempotencyKey: string };
  }): Promise<{ transferStatus: string; status: string }>;
  refundToBuyer(input: {
    transactionId: string;
    actorUserId: string;
    body: { idempotencyKey: string };
    authority: "DISPUTE_ENGINE" | "ADMIN" | "SYSTEM";
  }): Promise<{ transferStatus: string; status: string }>;
};

export type DisputeResult = {
  dispute: VautoDispute;
  transactionStatus: string;
  transactionVersion: number;
  fundsFrozen: boolean;
  transferStatus: string | null;
  fundsAction: DisputeFundsAction | null;
  fundsTransferStatus: string | null;
  messageLt: string | null;
  idempotentReplay: boolean;
  disputeEngineVersion: typeof DISPUTE_ENGINE_VERSION;
};

export class DisputeAuthError extends Error {
  readonly code = "DISPUTE_FORBIDDEN" as const;
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "DisputeAuthError";
  }
}

export class DisputeStateError extends Error {
  readonly code = "DISPUTE_INVALID_STATE" as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = "DisputeStateError";
  }
}

export class DisputeNotFoundError extends Error {
  readonly code = "DISPUTE_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "DisputeNotFoundError";
  }
}

export class DisputeAdminRequiredError extends Error {
  readonly code = "DISPUTE_ADMIN_REQUIRED" as const;
  readonly httpStatus = 403;
  constructor(
    message = "Admin or SYSTEM authority required to resolve dispute"
  ) {
    super(message);
    this.name = "DisputeAdminRequiredError";
  }
}
