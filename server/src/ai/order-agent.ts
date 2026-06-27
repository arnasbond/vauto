import type { ApiEscrowTransaction } from "../types.js";

export const COURIER_LOCKER_DELIVERED = "Pristatyta į paštomatą";
export const EXPRESS_CLAIM_MS = 24 * 60 * 60 * 1000;

export interface ExpressEscrowPatch {
  expressEscrow24h?: boolean;
  deliveredToLockerAt?: string;
  claimDeadlineAt?: string;
  courierStatus?: string;
  courierProvider?: string;
}

export function activateExpressEscrow24h(
  escrow: ApiEscrowTransaction,
  courierProvider?: string
): ApiEscrowTransaction & ExpressEscrowPatch {
  const now = Date.now();
  const deliveredAt = new Date(now).toISOString();
  return {
    ...escrow,
    status: "delivered",
    expressEscrow24h: true,
    deliveredToLockerAt: deliveredAt,
    claimDeadlineAt: new Date(now + EXPRESS_CLAIM_MS).toISOString(),
    courierStatus: COURIER_LOCKER_DELIVERED,
    courierProvider,
    updatedAt: deliveredAt,
  };
}

export function confirmTransaction(
  escrow: ApiEscrowTransaction & ExpressEscrowPatch
): ApiEscrowTransaction & ExpressEscrowPatch {
  return {
    ...escrow,
    status: "completed",
    updatedAt: new Date().toISOString(),
  };
}

export function shouldAutoConfirmExpress(
  escrow: ApiEscrowTransaction & ExpressEscrowPatch
): boolean {
  if (!escrow.expressEscrow24h || escrow.status !== "delivered") return false;
  if (!escrow.claimDeadlineAt) return false;
  return Date.now() >= new Date(escrow.claimDeadlineAt).getTime();
}

export function buildExpressSellerNotification(
  sellerName: string,
  listingTitle: string
): string {
  const first = sellerName.trim().split(/\s+/)[0]?.replace(/\.$/, "") || "drauge";
  const item = listingTitle.trim() || "prekė";
  return `${first}, ${item} pristatyta! Aktyvavau 24h pasimatavimo laikmatį, pinigai įkris automatiškai.`;
}
