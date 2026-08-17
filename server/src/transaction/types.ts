/**
 * Transaction State Machine 1.0 — types.
 * Server-authoritative only; clients never set status directly.
 */

import type { TRANSACTION_STATE_MACHINE_VERSION } from "./version.js";

export const TRANSACTION_STATUSES = [
  "DISCUSSION",
  "OFFER_PENDING",
  "NEGOTIATING",
  "AGREED",
  "PAYMENT_PENDING",
  "PAID",
  "SHIPPING_PENDING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "DISPUTED",
  "SERVICE_SCHEDULED",
  "SERVICE_PERFORMED",
  "CUSTOMER_CONFIRMED",
  "CONTACT_ACCEPTED",
  "INTERACTION_CLAIMED",
  "INTERACTION_CONFIRMED",
  "INTERACTION_COMPLETED",
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Happy-path (non-terminal) statuses in order. */
export const HAPPY_PATH_STATUSES = [
  "DISCUSSION",
  "OFFER_PENDING",
  "NEGOTIATING",
  "AGREED",
  "PAYMENT_PENDING",
  "PAID",
  "SHIPPING_PENDING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
] as const;

export const TERMINAL_STATUSES = [
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export const ACTOR_TYPES = ["BUYER", "SELLER", "SYSTEM", "ADMIN"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const REASON_CODES = [
  "BUYER_INITIATED",
  "SELLER_INITIATED",
  "MUTUAL_AGREEMENT",
  "OFFER_SUBMITTED",
  "COUNTER_OFFER",
  "OFFER_ACCEPTED",
  "PAYMENT_REQUESTED",
  "PAYMENT_CONFIRMED",
  "SHIPMENT_READY",
  "SHIPPED_CONFIRMED",
  "DELIVERY_CONFIRMED",
  "COMPLETION_CONFIRMED",
  "BUYER_CANCELLED",
  "SELLER_CANCELLED",
  "ADMIN_CANCELLED",
  "TIMEOUT_EXPIRED",
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED_BUYER_REFUND",
  "DISPUTE_RESOLVED_SELLER_PAYOUT",
  "REFUND_APPROVED",
  "SYSTEM_TRANSITION",
  "SERVICE_SCHEDULED",
  "SERVICE_PERFORMED",
  "CUSTOMER_CONFIRMED",
  "CONTACT_ACCEPTED",
  "INTERACTION_CLAIMED",
  "INTERACTION_CONFIRMED",
  "INTERACTION_COMPLETED",
] as const;

export const VERTICALS = [
  "GOODS",
  "SERVICES",
  "REAL_ESTATE",
  "JOBS",
] as const;
export type Vertical = (typeof VERTICALS)[number];

export const FULFILLMENT_TYPES = [
  "CARRIER_DELIVERY",
  "LOCAL_HANDOFF",
  "SERVICE_IN_PERSON",
  "SERVICE_REMOTE",
  "DIRECT_CONTACT",
] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const PAYMENT_MODES = [
  "FULL_ESCROW",
  "DEPOSIT_ESCROW",
  "PLATFORM_FEE_ONLY",
  "OFF_PLATFORM",
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const VERIFICATION_POLICIES = [
  "PLATFORM_TRANSACTION",
  "MUTUAL_COMPLETION",
  "APPOINTMENT_VERIFIED",
  "NO_VERIFIED_REVIEW",
] as const;
export type VerificationPolicy = (typeof VERIFICATION_POLICIES)[number];

export type ReasonCode = (typeof REASON_CODES)[number];

/** 11A–11I default composition: goods + Omniva carrier + full escrow. */
export const LEGACY_TRANSACTION_POLICY = {
  vertical: "GOODS" as const satisfies Vertical,
  fulfillmentType: "CARRIER_DELIVERY" as const satisfies FulfillmentType,
  paymentMode: "FULL_ESCROW" as const satisfies PaymentMode,
  verificationPolicy: "PLATFORM_TRANSACTION" as const satisfies VerificationPolicy,
  contractValueCents: null as number | null,
  platformManagedAmountCents: 0,
};

export type VautoTransaction = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: TransactionStatus;
  currentPrice: number | null;
  currency: string;
  version: number;
  idempotencyKey: string | null;
  stateMachineVersion: typeof TRANSACTION_STATE_MACHINE_VERSION;
  createdAt: string;
  updatedAt: string;
  /** Stage 11J — defaults keep 11A–11I goods + carrier + full escrow. */
  vertical: Vertical;
  fulfillmentType: FulfillmentType;
  paymentMode: PaymentMode;
  verificationPolicy: VerificationPolicy;
  contractValueCents: number | null;
  platformManagedAmountCents: number;
  /** Party who first claimed DIRECT_CONTACT interaction (11J.1 dual verification). */
  interactionClaimedBy?: string | null;
};

export type TransitionCommand = {
  transactionId: string;
  /** Expected optimistic-lock version. */
  expectedVersion: number;
  toStatus: TransactionStatus;
  actorType: ActorType;
  actorId: string;
  idempotencyKey: string;
  reasonCode: ReasonCode;
  metadata?: Record<string, unknown> | null;
};

export type TransitionResult = {
  transaction: VautoTransaction;
  eventId: string;
  auditId: string;
  fromStatus: TransactionStatus;
  toStatus: TransactionStatus;
  /** True when a prior identical idempotencyKey was replayed. */
  idempotentReplay: boolean;
  stateMachineVersion: typeof TRANSACTION_STATE_MACHINE_VERSION;
};

export type TransactionEventRecord = {
  id: string;
  transactionId: string;
  actorType: ActorType;
  actorId: string;
  eventType: string;
  fromStatus: TransactionStatus;
  toStatus: TransactionStatus;
  idempotencyKey: string;
  payloadJson: Record<string, unknown>;
  createdAt: string;
};

export type TransactionAuditRecord = {
  id: string;
  transactionId: string;
  sequenceId: number;
  eventId: string;
  stateHash: string;
  createdAt: string;
};

export class InvalidTransitionError extends Error {
  readonly code = "INVALID_TRANSITION" as const;
  constructor(
    public readonly from: TransactionStatus,
    public readonly to: TransactionStatus,
    public readonly actorType: ActorType,
    message?: string
  ) {
    super(
      message ??
        `Invalid transition ${from} -> ${to} for actor ${actorType}`
    );
    this.name = "InvalidTransitionError";
  }
}

export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(
    public readonly transactionId: string,
    public readonly expectedVersion: number
  ) {
    super(
      `Concurrent modification on transaction ${transactionId} (expected version ${expectedVersion})`
    );
    this.name = "VersionConflictError";
  }
}

export class TransactionNotFoundError extends Error {
  readonly code = "TRANSACTION_NOT_FOUND" as const;
  constructor(public readonly transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
    this.name = "TransactionNotFoundError";
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(public readonly idempotencyKey: string) {
    super(
      `Idempotency key reused with a different payload: ${idempotencyKey}`
    );
    this.name = "IdempotencyConflictError";
  }
}

/** Fail-closed policy composition (vertical × fulfillment × payment × verification). HTTP 400. */
export class InvalidPolicyCompositionError extends Error {
  readonly code = "INVALID_POLICY_COMPOSITION" as const;
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
    this.name = "InvalidPolicyCompositionError";
  }
}

/** Policy denied an actor (e.g. provider self-completing a service). HTTP 403. */
export class PolicyForbiddenError extends InvalidTransitionError {
  readonly policyCode = "POLICY_FORBIDDEN" as const;
  readonly httpStatus = 403;
  constructor(
    from: TransactionStatus,
    to: TransactionStatus,
    actorType: ActorType,
    message?: string
  ) {
    super(from, to, actorType, message ?? "Policy forbids this transition");
    this.name = "PolicyForbiddenError";
  }
}
