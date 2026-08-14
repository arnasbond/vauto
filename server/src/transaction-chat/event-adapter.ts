/**
 * Convert 11A/11B domain facts → timeline presentation (server-only).
 */

import type { DomainEventType } from "./types.js";
import type { VautoOffer } from "../transaction/offers/types.js";
import type { VautoTransaction } from "../transaction/types.js";

export type DomainEventWrite = {
  eventType: DomainEventType;
  text: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

export function offerCreatedEvent(
  offer: VautoOffer,
  tx: VautoTransaction
): DomainEventWrite {
  return {
    eventType: "OFFER_CREATED",
    text: `Pasiūlymas: ${(offer.amountCents / 100).toFixed(2)} €`,
    payload: {
      offerId: offer.id,
      amountCents: offer.amountCents,
      currency: offer.currency,
      createdByUserId: offer.createdByUserId,
      transactionStatus: tx.status,
    },
    idempotencyKey: `domain-offer-created-${offer.id}`,
  };
}

export function offerCounteredEvent(
  offer: VautoOffer,
  parentOfferId: string,
  tx: VautoTransaction
): DomainEventWrite {
  return {
    eventType: "OFFER_COUNTERED",
    text: `Kontrpasiūlymas: ${(offer.amountCents / 100).toFixed(2)} €`,
    payload: {
      offerId: offer.id,
      parentOfferId,
      amountCents: offer.amountCents,
      currency: offer.currency,
      createdByUserId: offer.createdByUserId,
      transactionStatus: tx.status,
    },
    idempotencyKey: `domain-offer-countered-${offer.id}`,
  };
}

export function offerAcceptedEvent(
  offer: VautoOffer,
  tx: VautoTransaction
): DomainEventWrite {
  return {
    eventType: "OFFER_ACCEPTED",
    text: `Pasiūlymas priimtas: ${(offer.amountCents / 100).toFixed(2)} €`,
    payload: {
      offerId: offer.id,
      amountCents: offer.amountCents,
      transactionStatus: tx.status,
    },
    idempotencyKey: `domain-offer-accepted-${offer.id}`,
  };
}

export function offerRejectedEvent(
  offer: VautoOffer,
  tx: VautoTransaction
): DomainEventWrite {
  return {
    eventType: "OFFER_REJECTED",
    text: "Pasiūlymas atmestas",
    payload: {
      offerId: offer.id,
      amountCents: offer.amountCents,
      transactionStatus: tx.status,
    },
    idempotencyKey: `domain-offer-rejected-${offer.id}`,
  };
}

export function offerWithdrawnEvent(
  offer: VautoOffer,
  tx: VautoTransaction
): DomainEventWrite {
  return {
    eventType: "OFFER_WITHDRAWN",
    text: "Pasiūlymas atsiimtas",
    payload: {
      offerId: offer.id,
      amountCents: offer.amountCents,
      transactionStatus: tx.status,
    },
    idempotencyKey: `domain-offer-withdrawn-${offer.id}`,
  };
}

export function offerExpiredEvent(
  offer: VautoOffer,
  tx: VautoTransaction
): DomainEventWrite {
  return {
    eventType: "OFFER_EXPIRED",
    text: "Pasiūlymas baigė galioti",
    payload: {
      offerId: offer.id,
      amountCents: offer.amountCents,
      transactionStatus: tx.status,
    },
    idempotencyKey: `domain-offer-expired-${offer.id}`,
  };
}

export function transactionStateChangedEvent(
  tx: VautoTransaction,
  fromStatus: string,
  reason: string
): DomainEventWrite {
  return {
    eventType: "TRANSACTION_STATE_CHANGED",
    text: `Sandorio būsena: ${fromStatus} → ${tx.status}`,
    payload: {
      fromStatus,
      toStatus: tx.status,
      version: tx.version,
      reason,
    },
    idempotencyKey: `domain-tx-state-${tx.id}-v${tx.version}`,
  };
}

/** Allowed client actions — derived from state, never from chat text. */
export function computeAllowedActions(input: {
  userId: string;
  buyerId: string;
  sellerId: string;
  status: string;
}): string[] {
  const { userId, buyerId, sellerId, status } = input;
  const isBuyer = userId === buyerId;
  const isSeller = userId === sellerId;
  if (!isBuyer && !isSeller) return [];
  const actions = ["SEND_MESSAGE"];
  if (
    status === "DISCUSSION" ||
    status === "OFFER_PENDING" ||
    status === "NEGOTIATING"
  ) {
    actions.push("CREATE_OFFER", "COUNTER_OFFER");
    if (isSeller || isBuyer) actions.push("ACCEPT_OFFER", "REJECT_OFFER");
    actions.push("WITHDRAW_OFFER");
  }
  return [...new Set(actions)];
}
