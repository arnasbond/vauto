/**
 * Stage 11G.2 M-01 — Monotonic delivery status ranks (app-layer mirror of SQL).
 */

import type { DeliveryStatus } from "./types.js";
import { DeliveryStateError } from "./types.js";

const RANK: Record<DeliveryStatus, number> = {
  PENDING_LABEL: 0,
  LABEL_CREATED: 1,
  IN_TRANSIT: 2,
  DELIVERED: 3,
  FAILED_DELIVERY: 2,
};

export function deliveryStatusRank(status: DeliveryStatus): number {
  return RANK[status];
}

/** True when `to` is allowed after `from` (no regression). */
export function isMonotonicDeliveryTransition(
  from: DeliveryStatus,
  to: DeliveryStatus
): boolean {
  if (from === to) return true;
  if (from === "DELIVERED" && to !== "DELIVERED") return false;
  if (from === "FAILED_DELIVERY" && to !== "FAILED_DELIVERY") return false;
  if (to === "FAILED_DELIVERY") {
    return from === "LABEL_CREATED" || from === "IN_TRANSIT" || from === "FAILED_DELIVERY";
  }
  return deliveryStatusRank(to) >= deliveryStatusRank(from);
}

export function assertMonotonicDeliveryTransition(
  from: DeliveryStatus,
  to: DeliveryStatus
): void {
  if (!isMonotonicDeliveryTransition(from, to)) {
    throw new DeliveryStateError(
      `Delivery status regression forbidden: ${from} → ${to}`
    );
  }
}

/** Carrier scan events that authorize SHIPPING_PENDING → SHIPPED. */
export function isPhysicalScanStatus(status: string): boolean {
  return status === "IN_TRANSIT" || status === "CARRIER_ACCEPTED";
}
