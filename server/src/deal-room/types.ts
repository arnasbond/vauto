/**
 * Deal Room 1.0 — types (read model only; no state authority).
 */

import type { DEAL_ROOM_VERSION } from "./version.js";

export const DEAL_ROOM_ALLOWED_ACTIONS = [
  "SEND_MESSAGE",
  "CREATE_OFFER",
  "ACCEPT_OFFER",
  "REJECT_OFFER",
  "COUNTER_OFFER",
  "WITHDRAW_OFFER",
  "OPEN_COPILOT",
  "DRAFT_COPILOT_MESSAGE",
] as const;

export type DealRoomAllowedAction =
  (typeof DEAL_ROOM_ALLOWED_ACTIONS)[number];

export type ParticipantSummary = {
  userId: string;
  role: "BUYER" | "SELLER";
  displayName: string;
  avatarUrl: string | null;
  verified: boolean;
};

export type DealRoomListingSummary = {
  id: string;
  title: string;
  thumbnail: string | null;
  askingPriceCents: number | null;
  currency: "EUR";
};

export type DealRoomActiveOffer = {
  id: string;
  amountCents: number;
  createdByRole: "BUYER" | "SELLER";
  status: string;
  expiresAt: string | null;
  version: number;
};

export type AgreementSnapshotView = {
  id: string;
  acceptedOfferId: string;
  amountCents: number;
  currency: "EUR";
  listingTitle: string;
  listingAttributes: Record<string, unknown>;
  listingPrimaryImage: string | null;
  snapshotHash: string;
  createdAt: string;
};

export type TransactionSummaryFuture = {
  paymentStatus: "NOT_AVAILABLE";
  shippingStatus: "NOT_AVAILABLE";
  protectionStatus: "NOT_AVAILABLE";
};

export type DealRoomTimelineItem = {
  id: string;
  messageType: "USER_MESSAGE" | "DOMAIN_EVENT";
  eventType: string | null;
  senderId: string | null;
  textSafe: string;
  createdAt: string;
};

export type DealRoomResponse = {
  dealRoomVersion: typeof DEAL_ROOM_VERSION;
  transaction: {
    id: string;
    state: string;
    version: number;
  };
  listing: DealRoomListingSummary;
  buyer: ParticipantSummary;
  seller: ParticipantSummary;
  activeOffer: DealRoomActiveOffer | null;
  agreementSnapshot: AgreementSnapshotView | null;
  transactionSummary: TransactionSummaryFuture;
  allowedActions: DealRoomAllowedAction[];
  timelinePreview: DealRoomTimelineItem[];
  transactionVersion: number;
  activeOfferVersion: number | null;
  viewerRole: "BUYER" | "SELLER";
};

export type DealSnapshotRow = {
  id: string;
  transactionId: string;
  acceptedOfferId: string;
  amountCents: number;
  currency: "EUR";
  listingId: string;
  listingTitle: string;
  listingAttributesJson: Record<string, unknown>;
  listingPrimaryImage: string | null;
  buyerId: string;
  sellerId: string;
  snapshotHash: string;
  createdAt: string;
};

export class DealRoomAuthError extends Error {
  readonly code = "DEAL_ROOM_FORBIDDEN" as const;
  readonly httpStatus = 404; // IDOR: never leak existence via 403
  constructor(message = "Not found") {
    super(message);
    this.name = "DealRoomAuthError";
  }
}

export class DealRoomNotFoundError extends Error {
  readonly code = "DEAL_ROOM_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(public readonly transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
    this.name = "DealRoomNotFoundError";
  }
}

export class DealRoomVersionConflictError extends Error {
  readonly code = "DEAL_ROOM_VERSION_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(message: string) {
    super(message);
    this.name = "DealRoomVersionConflictError";
  }
}

export class DealRoomValidationError extends Error {
  readonly code = "DEAL_ROOM_VALIDATION" as const;
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
    this.name = "DealRoomValidationError";
  }
}
