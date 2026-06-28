import type { ChatThread, EscrowStatus, EscrowTransaction } from "@/lib/types";

export function generateTrackingCode(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `#VAUTO-${new Date().getFullYear()}-${n}`;
}

export function createEscrow(
  chat: ChatThread,
  amount: number,
  status: EscrowStatus = "offered"
): EscrowTransaction {
  const now = new Date().toISOString();
  return {
    id: `esc-${chat.id}`,
    threadId: chat.id,
    listingId: chat.listingId,
    buyerId: chat.buyerId,
    sellerId: chat.sellerId,
    amount,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

export function patchEscrow(
  escrow: EscrowTransaction,
  patch: Partial<
    Pick<
      EscrowTransaction,
      | "status"
      | "trackingCode"
      | "expressEscrow24h"
      | "deliveredToLockerAt"
      | "claimDeadlineAt"
      | "courierStatus"
      | "courierProvider"
      | "buyerProtectionFee"
      | "buyerTotal"
      | "stripePaymentIntentId"
      | "shippingLabelId"
      | "deliveryStatus"
      | "buyerConfirmed"
      | "shippingProvider"
      | "shippingLockerId"
      | "shippingLockerName"
    >
  >
): EscrowTransaction {
  return {
    ...escrow,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}
