/**
 * Role / ownership / expiry validation — no I/O.
 */

import {
  OfferAuthError,
  OfferStateError,
  type OfferStatus,
  type VautoOffer,
} from "./types.js";
import type { VautoTransaction } from "../types.js";

export type OfferActorRole = "BUYER" | "SELLER";

export function resolveActorRole(
  userId: string,
  tx: VautoTransaction
): OfferActorRole {
  if (userId === tx.buyerId) return "BUYER";
  if (userId === tx.sellerId) return "SELLER";
  throw new OfferAuthError("Not a participant of this transaction");
}

export function assertParticipant(
  userId: string,
  offer: VautoOffer
): OfferActorRole {
  if (userId === offer.buyerId) return "BUYER";
  if (userId === offer.sellerId) return "SELLER";
  throw new OfferAuthError("Not a participant of this offer");
}

/** Buyer cannot accept/reject their own open offer; seller cannot accept own. */
export function assertCounterpartyAction(
  userId: string,
  offer: VautoOffer,
  action: "accept" | "reject"
): void {
  if (offer.createdByUserId === userId) {
    throw new OfferAuthError(
      `Creator cannot ${action} their own offer`
    );
  }
  assertParticipant(userId, offer);
}

export function assertCanWithdraw(userId: string, offer: VautoOffer): void {
  if (offer.createdByUserId !== userId) {
    throw new OfferAuthError("Only the creator can withdraw an offer");
  }
}

export function assertOfferPending(offer: VautoOffer): void {
  if (offer.status !== "PENDING") {
    throw new OfferStateError(
      `Offer status ${offer.status} is not PENDING`
    );
  }
}

export function assertNotExpired(
  offer: VautoOffer,
  now: Date = new Date()
): void {
  if (offer.expiresAt) {
    const exp = Date.parse(offer.expiresAt);
    if (Number.isFinite(exp) && exp <= now.getTime()) {
      throw new OfferStateError("Offer has expired");
    }
  }
}

export function isTerminalOfferStatus(status: OfferStatus): boolean {
  return (
    status === "ACCEPTED" ||
    status === "REJECTED" ||
    status === "WITHDRAWN" ||
    status === "EXPIRED" ||
    status === "COUNTERED"
  );
}

export function assertCanListOffers(
  userId: string,
  tx: VautoTransaction
): void {
  resolveActorRole(userId, tx);
}

/**
 * H-02: Initial offer in DISCUSSION may be created by BUYER only.
 * Seller must counter via counterOffer after a buyer tip exists.
 */
export function assertBuyerCanCreateInitialOffer(
  role: OfferActorRole,
  status: string
): void {
  if (status === "DISCUSSION" && role !== "BUYER") {
    throw new OfferAuthError(
      "Only the buyer may create the initial offer in DISCUSSION"
    );
  }
}
