import type { EscrowTransaction } from "@/lib/types";
import type { ShippingProviderId } from "@/lib/shipping/shipping-provider";
import { getFirstName } from "@/lib/buddy-voice";

/** Kurjerių statusas, kuris aktyvuoja 24h express escrow (Omniva/DPD/LP). */
export const COURIER_LOCKER_DELIVERED = "Pristatyta į paštomatą";

export const EXPRESS_CLAIM_MS = 24 * 60 * 60 * 1000;

export function buildExpressSellerNotification(
  sellerName: string,
  listingTitle: string
): string {
  const first = getFirstName(sellerName);
  const item = listingTitle.trim() || "prekė";
  return `${first}, ${item} pristatyta! Aktyvavau 24h pasimatavimo laikmatį, pinigai įkris automatiškai.`;
}

export function activateExpressEscrow24h(
  escrow: EscrowTransaction,
  courierProvider?: ShippingProviderId
): EscrowTransaction {
  const now = Date.now();
  const deliveredAt = new Date(now).toISOString();
  const claimDeadlineAt = new Date(now + EXPRESS_CLAIM_MS).toISOString();
  return {
    ...escrow,
    status: "delivered",
    expressEscrow24h: true,
    deliveredToLockerAt: deliveredAt,
    claimDeadlineAt,
    courierStatus: COURIER_LOCKER_DELIVERED,
    courierProvider,
    updatedAt: deliveredAt,
  };
}

/** Automatinis pinigų pervedimas pardavėjui po 24h be pretenzijos. */
export function confirmTransaction(escrow: EscrowTransaction): EscrowTransaction {
  return {
    ...escrow,
    status: "completed",
    updatedAt: new Date().toISOString(),
  };
}

export function isExpressClaimExpired(escrow: EscrowTransaction): boolean {
  if (!escrow.claimDeadlineAt || escrow.status !== "delivered") return false;
  return Date.now() >= new Date(escrow.claimDeadlineAt).getTime();
}

export function expressClaimRemainingMs(escrow: EscrowTransaction): number {
  if (!escrow.claimDeadlineAt) return 0;
  return Math.max(0, new Date(escrow.claimDeadlineAt).getTime() - Date.now());
}

export function formatExpressDeadline(escrow: EscrowTransaction): string {
  if (!escrow.claimDeadlineAt) return "";
  return new Date(escrow.claimDeadlineAt).toLocaleString("lt-LT", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shouldAutoConfirmExpress(escrow: EscrowTransaction): boolean {
  return (
    Boolean(escrow.expressEscrow24h) &&
    escrow.status === "delivered" &&
    isExpressClaimExpired(escrow)
  );
}

export function simulateCourierLockerDelivery(
  escrow: EscrowTransaction,
  courierProvider: ShippingProviderId
): EscrowTransaction {
  return activateExpressEscrow24h(escrow, courierProvider);
}
