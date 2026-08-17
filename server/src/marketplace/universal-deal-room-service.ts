/**
 * Stage 13C Universal Deal Room — capability gate + existing 11B/11F engines.
 * Does not write payment ledger; payment uses public PaymentIntentService.
 * AI is optional and never required for offer/accept/reject/payment.
 */

import type { TxQueryable } from "../transaction/repository.js";
import { TransactionRepository } from "../transaction/repository.js";
import {
  OfferEngine,
  OfferAuthError,
  type VautoOffer,
} from "../transaction/offers/index.js";
import { createPaymentIntentService } from "../payment/index.js";
import { createStripePaymentIntentService } from "../payments/stripe/index.js";
import {
  DealCapabilityDeniedError,
  UNIVERSAL_DEAL_ROOM_VERSION,
  assertValidOfferMoney,
  type DealAction,
  type DealNegotiationState,
  type FulfillmentHint,
} from "../shared/marketplace-domain/deal-actions.js";
import type { CategoryCapabilities, VerticalId } from "../shared/marketplace-domain/types.js";
import {
  DealNotFoundError,
  DealPaymentStateError,
  PRIVILEGED_PAYMENT_TX_STATUSES,
  assertListingDealAction,
  assertNegotiationOrThrow,
  listingVerticalContext,
  loadListingDealRecord,
  negotiationFromOffers,
  type ListingDealRecord,
} from "./deal-authority.js";

export type DealAiPort = {
  suggest?: (input: {
    transactionId: string;
    actorUserId: string;
  }) => Promise<unknown>;
};

/** Test seam: prove Stripe is not constructed/called when capability fails. */
export type StripeIntentPort = {
  createStripePaymentIntent: (input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }) => Promise<unknown>;
};

export type UniversalDealRoomPorts = {
  stripeIntent?: StripeIntentPort;
};

export type PrivilegedPaymentAuthorization = {
  tx: {
    id: string;
    status: string;
    version: number;
    listingId: string;
    buyerId: string;
    sellerId: string;
  };
  listing: ListingDealRecord;
  verticalId: VerticalId | null;
};

export type UniversalDealSnapshot = {
  universalDealRoomVersion: typeof UNIVERSAL_DEAL_ROOM_VERSION;
  transaction: { id: string; status: string; version: number };
  listing: {
    id: string;
    title: string;
    sellerId: string;
  };
  verticalId: VerticalId | null;
  capabilities: CategoryCapabilities;
  allowedDealActions: readonly DealAction[];
  viewerDealActions: DealAction[];
  fulfillment: FulfillmentHint;
  dealState: DealNegotiationState;
  turn: "BUYER" | "SELLER" | "NONE";
  viewerRole: "BUYER" | "SELLER";
  buyerId: string;
  sellerId: string;
  activeOffer: {
    id: string;
    amountCents: number;
    currency: "EUR";
    status: string;
    version: number;
    createdByRole: "BUYER" | "SELLER";
    parentOfferId: string | null;
  } | null;
  acceptedAmountCents: number | null;
  history: Array<{
    id: string;
    amountCents: number;
    currency: "EUR";
    status: string;
    createdByRole: "BUYER" | "SELLER";
    parentOfferId: string | null;
    createdAt: string;
  }>;
};

function roleOf(userId: string, buyerId: string, sellerId: string): "BUYER" | "SELLER" {
  if (userId === buyerId) return "BUYER";
  if (userId === sellerId) return "SELLER";
  throw new DealNotFoundError();
}

function createdByRole(offer: VautoOffer): "BUYER" | "SELLER" {
  return offer.createdByUserId === offer.buyerId ? "BUYER" : "SELLER";
}

export class UniversalDealRoomService {
  private readonly offers: OfferEngine;
  private readonly txRepo: TransactionRepository;

  constructor(
    private readonly db: TxQueryable,
    private readonly ai: DealAiPort = {},
    private readonly ports: UniversalDealRoomPorts = {}
  ) {
    this.offers = new OfferEngine(db);
    this.txRepo = new TransactionRepository(db);
  }

  /**
   * Optional AI must never block the core flow.
   * Failures are swallowed; callers never wait on the result.
   */
  private ignoreAi(transactionId: string, actorUserId: string): void {
    const suggest = this.ai.suggest;
    if (!suggest) return;
    void Promise.resolve()
      .then(() => suggest({ transactionId, actorUserId }))
      .catch(() => undefined);
  }

  private async requireParticipant(transactionId: string, actorUserId: string) {
    const tx = await this.txRepo.getById(transactionId);
    if (!tx) throw new DealNotFoundError();
    try {
      roleOf(actorUserId, tx.buyerId, tx.sellerId);
    } catch {
      throw new DealNotFoundError();
    }
    return tx;
  }

  private async requireListing(listingId: string): Promise<ListingDealRecord> {
    const listing = await loadListingDealRecord(this.db, listingId);
    if (!listing) throw new DealNotFoundError();
    return listing;
  }

  private async gate(
    transactionId: string,
    actorUserId: string,
    action: DealAction,
    clientClaimedVertical?: unknown
  ) {
    const tx = await this.requireParticipant(transactionId, actorUserId);
    const listing = await this.requireListing(tx.listingId);
    const verticalId = assertListingDealAction(listing, action, clientClaimedVertical);
    const offers = await this.offers.list(tx.id, actorUserId);
    const history = offers.map((o) => ({
      status: o.status,
      parentOfferId: o.parentOfferId,
      createdByRole: createdByRole(o),
    }));
    const neg = negotiationFromOffers(tx.status, history);
    assertNegotiationOrThrow(neg.state, action);
    return { tx, listing, verticalId, offers, neg };
  }

  async getSnapshot(input: {
    transactionId: string;
    actorUserId: string;
    clientVertical?: unknown;
  }): Promise<UniversalDealSnapshot> {
    const tx = await this.requireParticipant(input.transactionId, input.actorUserId);
    const listing = await this.requireListing(tx.listingId);
    const ctx = listingVerticalContext(listing, input.clientVertical);
    const viewerRole = roleOf(input.actorUserId, tx.buyerId, tx.sellerId);
    const offers = await this.offers.list(tx.id, input.actorUserId);
    const historyItems = offers.map((o) => ({
      status: o.status,
      parentOfferId: o.parentOfferId,
      createdByRole: createdByRole(o),
    }));
    const neg = negotiationFromOffers(tx.status, historyItems);
    const pending = [...offers].reverse().find((o) => o.status === "PENDING") ?? null;
    const accepted = [...offers].reverse().find((o) => o.status === "ACCEPTED") ?? null;

    const viewerDealActions = ctx.allowedActions.filter((action) => {
      try {
        assertNegotiationOrThrow(neg.state, action);
      } catch {
        if (action === "INITIATE_PAYMENT") {
          return (
            ctx.capabilities.supportsPlatformPayment &&
            viewerRole === "BUYER" &&
            (tx.status === "AGREED" || tx.status === "PAYMENT_PENDING")
          );
        }
        if (action === "APPOINTMENT" || action === "APPLICATION" || action === "CONTACT") {
          return true;
        }
        if (action === "CANCEL") {
          return neg.state !== "ACCEPTED" && neg.state !== "CANCELLED";
        }
        return false;
      }
      if (action === "OFFER") {
        return viewerRole === "BUYER" && (neg.state === "OPEN" || neg.state === "REJECTED");
      }
      if (action === "COUNTER_OFFER" || action === "ACCEPT" || action === "REJECT") {
        if (!pending) return false;
        return createdByRole(pending) !== viewerRole;
      }
      if (action === "INITIATE_PAYMENT") {
        return (
          viewerRole === "BUYER" &&
          (tx.status === "AGREED" || tx.status === "PAYMENT_PENDING")
        );
      }
      return true;
    });

    this.ignoreAi(tx.id, input.actorUserId);

    return {
      universalDealRoomVersion: UNIVERSAL_DEAL_ROOM_VERSION,
      transaction: { id: tx.id, status: tx.status, version: tx.version },
      listing: { id: listing.id, title: listing.title, sellerId: listing.sellerId },
      verticalId: ctx.verticalId,
      capabilities: ctx.capabilities,
      allowedDealActions: ctx.allowedActions,
      viewerDealActions,
      fulfillment: ctx.fulfillment,
      dealState: neg.state,
      turn: neg.turn,
      viewerRole,
      buyerId: tx.buyerId,
      sellerId: tx.sellerId,
      activeOffer: pending
        ? {
            id: pending.id,
            amountCents: pending.amountCents,
            currency: "EUR",
            status: pending.status,
            version: pending.version,
            createdByRole: createdByRole(pending),
            parentOfferId: pending.parentOfferId,
          }
        : null,
      acceptedAmountCents: accepted?.amountCents ?? null,
      history: offers.map((o) => ({
        id: o.id,
        amountCents: o.amountCents,
        currency: "EUR" as const,
        status: o.status,
        createdByRole: createdByRole(o),
        parentOfferId: o.parentOfferId,
        createdAt: o.createdAt,
      })),
    };
  }

  async createOffer(input: {
    transactionId: string;
    actorUserId: string;
    amountCents: unknown;
    currency?: unknown;
    idempotencyKey: string;
    clientVertical?: unknown;
  }) {
    assertValidOfferMoney({
      amountCents: input.amountCents,
      currency: input.currency,
    });
    await this.gate(
      input.transactionId,
      input.actorUserId,
      "OFFER",
      input.clientVertical
    );
    this.ignoreAi(input.transactionId, input.actorUserId);
    return this.offers.create({
      transactionId: input.transactionId,
      actorUserId: input.actorUserId,
      amountCents: input.amountCents as number,
      currency: "EUR",
      idempotencyKey: input.idempotencyKey,
    });
  }

  async counterOffer(input: {
    offerId: string;
    actorUserId: string;
    amountCents: unknown;
    currency?: unknown;
    idempotencyKey: string;
    expectedVersion: number;
    clientVertical?: unknown;
  }) {
    assertValidOfferMoney({
      amountCents: input.amountCents,
      currency: input.currency,
    });
    const current = await this.offers.get(input.offerId);
    if (!current) throw new DealNotFoundError();
    await this.gate(
      current.transactionId,
      input.actorUserId,
      "COUNTER_OFFER",
      input.clientVertical
    );
    this.ignoreAi(current.transactionId, input.actorUserId);
    return this.offers.counter({
      offerId: input.offerId,
      actorUserId: input.actorUserId,
      amountCents: input.amountCents as number,
      currency: "EUR",
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
    });
  }

  async acceptOffer(input: {
    offerId: string;
    actorUserId: string;
    idempotencyKey: string;
    expectedVersion: number;
    clientVertical?: unknown;
  }) {
    const current = await this.offers.get(input.offerId);
    if (!current) throw new DealNotFoundError();
    await this.gate(
      current.transactionId,
      input.actorUserId,
      "ACCEPT",
      input.clientVertical
    );
    this.ignoreAi(current.transactionId, input.actorUserId);
    return this.offers.accept({
      offerId: input.offerId,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
    });
  }

  async rejectOffer(input: {
    offerId: string;
    actorUserId: string;
    idempotencyKey: string;
    expectedVersion: number;
    clientVertical?: unknown;
  }) {
    const current = await this.offers.get(input.offerId);
    if (!current) throw new DealNotFoundError();
    await this.gate(
      current.transactionId,
      input.actorUserId,
      "REJECT",
      input.clientVertical
    );
    this.ignoreAi(current.transactionId, input.actorUserId);
    return this.offers.reject({
      offerId: input.offerId,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
    });
  }

  /**
   * Independent fail-closed gate for every privileged payment entry point.
   * Client vertical is ignored; amount is never taken from the client.
   */
  async authorizePrivilegedPayment(input: {
    transactionId: string;
    actorUserId: string;
    clientVertical?: unknown;
  }): Promise<PrivilegedPaymentAuthorization> {
    const tx = await this.requireParticipant(input.transactionId, input.actorUserId);
    const listing = await this.requireListing(tx.listingId);
    const verticalId = assertListingDealAction(
      listing,
      "INITIATE_PAYMENT",
      input.clientVertical
    );
    const viewerRole = roleOf(input.actorUserId, tx.buyerId, tx.sellerId);
    if (viewerRole !== "BUYER") throw new DealNotFoundError();
    if (
      !(PRIVILEGED_PAYMENT_TX_STATUSES as readonly string[]).includes(tx.status)
    ) {
      throw new DealPaymentStateError(tx.status);
    }
    this.ignoreAi(tx.id, input.actorUserId);
    return { tx, listing, verticalId };
  }

  /**
   * Payment amount is NEVER taken from the client.
   * Uses 11F PaymentIntentService (snapshot / accepted offer).
   */
  async initiatePayment(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
    clientVertical?: unknown;
  }) {
    await this.authorizePrivilegedPayment(input);
    const svc = createPaymentIntentService(this.db);
    return svc.createPaymentIntent({
      transactionId: input.transactionId,
      actorUserId: input.actorUserId,
      body: input.body,
    });
  }

  /**
   * Stripe checkout entry — same 13C guard as initiatePayment, then public 11F Stripe service.
   */
  async createStripePaymentIntent(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
    clientVertical?: unknown;
  }) {
    await this.authorizePrivilegedPayment(input);
    const stripe =
      this.ports.stripeIntent ?? createStripePaymentIntentService(this.db);
    return stripe.createStripePaymentIntent({
      transactionId: input.transactionId,
      actorUserId: input.actorUserId,
      body: input.body,
    }) as Promise<{ idempotentReplay: boolean }>;
  }

  async withdrawOffer(input: {
    offerId: string;
    actorUserId: string;
    idempotencyKey: string;
    expectedVersion: number;
    clientVertical?: unknown;
  }) {
    const current = await this.offers.get(input.offerId);
    if (!current) throw new DealNotFoundError();
    await this.gate(
      current.transactionId,
      input.actorUserId,
      "CANCEL",
      input.clientVertical
    );
    if (current.createdByUserId !== input.actorUserId) {
      throw new DealNotFoundError();
    }
    this.ignoreAi(current.transactionId, input.actorUserId);
    return this.offers.withdraw({
      offerId: input.offerId,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
    });
  }
}

export function createUniversalDealRoomService(
  db: TxQueryable,
  ai?: DealAiPort,
  ports?: UniversalDealRoomPorts
): UniversalDealRoomService {
  return new UniversalDealRoomService(db, ai, ports);
}

export {
  DealCapabilityDeniedError,
  DealNotFoundError,
  DealPaymentStateError,
  OfferAuthError,
};
