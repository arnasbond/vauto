/**
 * Transaction Chat 1.0 — types.
 * USER_MESSAGE never changes transaction state.
 * DOMAIN_EVENT is server-only.
 */

import type { TRANSACTION_CHAT_VERSION } from "./version.js";

export const MESSAGE_TYPES = ["USER_MESSAGE", "DOMAIN_EVENT"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const DOMAIN_EVENT_TYPES = [
  "OFFER_CREATED",
  "OFFER_COUNTERED",
  "OFFER_ACCEPTED",
  "OFFER_REJECTED",
  "OFFER_WITHDRAWN",
  "OFFER_EXPIRED",
  "TRANSACTION_STATE_CHANGED",
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export type TimelineItem = {
  id: string;
  transactionId: string;
  messageType: MessageType;
  eventType: DomainEventType | null;
  senderId: string | null;
  text: string;
  /** HTML-escaped presentation text (XSS contract). */
  textSafe: string;
  payload: Record<string, unknown>;
  createdAt: string;
  chatVersion: typeof TRANSACTION_CHAT_VERSION;
};

export type TimelinePage = {
  items: TimelineItem[];
  nextCursor: string | null;
  header: TimelineHeader;
  chatVersion: typeof TRANSACTION_CHAT_VERSION;
};

export type TimelineHeader = {
  transactionId: string;
  listingId: string;
  transactionState: string;
  transactionVersion: number;
  buyerId: string;
  sellerId: string;
  allowedActions: string[];
};

export type TransactionMessageRow = {
  id: string;
  transactionId: string;
  senderId: string | null;
  messageType: MessageType;
  eventType: DomainEventType | null;
  text: string;
  payloadJson: Record<string, unknown>;
  idempotencyKey: string | null;
  deletedAt: string | null;
  createdAt: string;
  chatVersion: typeof TRANSACTION_CHAT_VERSION;
};

export class ChatAuthError extends Error {
  readonly code = "CHAT_FORBIDDEN" as const;
  readonly httpStatus = 403;
  constructor(message = "Not a transaction participant") {
    super(message);
    this.name = "ChatAuthError";
  }
}

export class ChatNotFoundError extends Error {
  readonly code = "CHAT_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(public readonly transactionId: string) {
    super(`Transaction chat not found: ${transactionId}`);
    this.name = "ChatNotFoundError";
  }
}

export class ChatValidationError extends Error {
  readonly code = "CHAT_VALIDATION" as const;
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
    this.name = "ChatValidationError";
  }
}
