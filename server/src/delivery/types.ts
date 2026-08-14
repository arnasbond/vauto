/**
 * Stage 11G — Delivery domain types (11G.2 hardening).
 */

import type { DELIVERY_INTEGRATION_VERSION } from "./version.js";

export const DELIVERY_CARRIERS = [
  "OMNIVA",
  "DPD",
  "LP_EXPRESS",
  "DIRECT_COURIER",
] as const;

export type DeliveryCarrier = (typeof DELIVERY_CARRIERS)[number];

export const DELIVERY_STATUSES = [
  "PENDING_LABEL",
  "LABEL_CREATED",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED_DELIVERY",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Carrier API may report CARRIER_ACCEPTED; stored as IN_TRANSIT. */
export type CarrierReportedStatus = DeliveryStatus | "CARRIER_ACCEPTED";

export type VautoDelivery = {
  id: string;
  transactionId: string;
  carrier: DeliveryCarrier;
  trackingCode: string;
  terminalId: string | null;
  shippingFeeCents: number;
  status: DeliveryStatus;
  carrierLabelId: string | null;
  trackingUrl: string | null;
  deliveryIntegrationVersion: typeof DELIVERY_INTEGRATION_VERSION;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryResult = {
  delivery: VautoDelivery;
  transactionStatus: string;
  transactionVersion: number;
  releaseTriggered: boolean;
  releaseTransferStatus: string | null;
  messageLt: string | null;
  idempotentReplay: boolean;
  deliveryIntegrationVersion: typeof DELIVERY_INTEGRATION_VERSION;
};

export type CarrierLabelInput = {
  transactionId: string;
  carrier: DeliveryCarrier;
  terminalId?: string | null;
  shippingFeeCents?: number;
  /** Optional seller-provided tracking (otherwise Fake/Real adapter generates). */
  trackingCode?: string | null;
};

export type CarrierLabelResult = {
  trackingCode: string;
  labelId: string;
  trackingUrl: string;
  carrier: DeliveryCarrier;
};

export type CarrierTrackingSnapshot = {
  trackingCode: string;
  status: CarrierReportedStatus;
  rawStatus: string;
  summaryLt: string;
};

export interface CarrierAdapter {
  readonly name: string;
  /**
   * Authoritative adapters may drive SYSTEM SM transitions (SHIPPED / DELIVERED).
   * Fake is authoritative only outside production (tests/dev). Production Fake → 503.
   */
  readonly authoritative: boolean;
  createLabel(input: CarrierLabelInput): Promise<CarrierLabelResult>;
  fetchTracking(trackingCode: string): Promise<CarrierTrackingSnapshot>;
}

/** Optional port — production wires 11F.4 FundsTransferService. */
export type ReleaseFundsPort = {
  releaseToSeller(input: {
    transactionId: string;
    actorUserId: string;
    body: { idempotencyKey: string };
  }): Promise<{ transferStatus: string; status: string }>;
};

export class DeliveryAuthError extends Error {
  readonly code = "DELIVERY_FORBIDDEN" as const;
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "DeliveryAuthError";
  }
}

export class DeliveryStateError extends Error {
  readonly code = "DELIVERY_INVALID_STATE" as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = "DeliveryStateError";
  }
}

export class DeliveryNotFoundError extends Error {
  readonly code = "DELIVERY_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "DeliveryNotFoundError";
  }
}

/** H-02 — dispute / refund / financial lock before DELIVERED + payout. */
export class DeliveryReleaseBlockedError extends Error {
  readonly code = "DELIVERY_RELEASE_BLOCKED" as const;
  readonly httpStatus: 403 | 409;
  readonly reason: string;
  constructor(
    message: string,
    httpStatus: 403 | 409 = 409,
    reason = "RELEASE_BLOCKED"
  ) {
    super(message);
    this.name = "DeliveryReleaseBlockedError";
    this.httpStatus = httpStatus;
    this.reason = reason;
  }
}

/** H-01/H-03 — production without real carrier adapter. */
export class DeliveryCarrierUnavailableError extends Error {
  readonly code = "DELIVERY_CARRIER_UNAVAILABLE" as const;
  readonly httpStatus = 503;
  constructor(
    message = "Carrier adapter not configured for production (fail-closed)"
  ) {
    super(message);
    this.name = "DeliveryCarrierUnavailableError";
  }
}
