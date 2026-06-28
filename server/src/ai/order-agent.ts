import type { ApiEscrowTransaction } from "../types.js";
import { confirmDelivery, isStripeEscrowLive } from "../billing/stripe-b2b.js";
import { confirmEscrowDelivery } from "../repository.js";

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
    buyerConfirmed: true,
    deliveryStatus: "delivered_confirmed",
    updatedAt: new Date().toISOString(),
  };
}

/** Server-side delivery confirmation — captures Stripe hold then marks DB. */
export async function confirmDeliveryForEscrow(
  escrowId: string
): Promise<(ApiEscrowTransaction & ExpressEscrowPatch) | null> {
  const { getEscrowById } = await import("../repository.js");
  const escrow = await getEscrowById(escrowId);
  if (!escrow) return null;
  if (isStripeEscrowLive() && escrow.stripePaymentIntentId) {
    await confirmDelivery(escrow.stripePaymentIntentId);
  }
  return (await confirmEscrowDelivery(escrowId)) as ApiEscrowTransaction & ExpressEscrowPatch;
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
