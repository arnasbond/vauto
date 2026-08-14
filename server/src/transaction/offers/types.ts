/**
 * Structured Offers 1.0 — types.
 * Money is ALWAYS integer amountCents. Clients never set status / identities.
 */

import type { STRUCTURED_OFFERS_VERSION } from "./version.js";

export const OFFER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "COUNTERED",
  "WITHDRAWN",
  "EXPIRED",
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];

export type VautoOffer = {
  id: string;
  transactionId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  createdByUserId: string;
  parentOfferId: string | null;
  amountCents: number;
  currency: "EUR";
  status: OfferStatus;
  version: number;
  idempotencyKey: string;
  expiresAt: string | null;
  offersVersion: typeof STRUCTURED_OFFERS_VERSION;
  createdAt: string;
  updatedAt: string;
};

/** Client-facing create body — identities loaded server-side. */
export type CreateOfferClientInput = {
  amountCents: number;
  currency?: "EUR";
  expiresAt?: string | null;
  idempotencyKey: string;
};

export type CounterOfferClientInput = {
  amountCents: number;
  currency?: "EUR";
  expiresAt?: string | null;
  idempotencyKey: string;
  /** Optimistic lock on the offer being countered. */
  expectedVersion: number;
};

export type OfferActionClientInput = {
  idempotencyKey: string;
  expectedVersion: number;
};

export class OfferAuthError extends Error {
  readonly code = "OFFER_FORBIDDEN" as const;
  readonly httpStatus = 403;
  constructor(message: string) {
    super(message);
    this.name = "OfferAuthError";
  }
}

export class OfferNotFoundError extends Error {
  readonly code = "OFFER_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(public readonly offerId: string) {
    super(`Offer not found: ${offerId}`);
    this.name = "OfferNotFoundError";
  }
}

export class OfferStateError extends Error {
  readonly code = "OFFER_INVALID_STATE" as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = "OfferStateError";
  }
}

export class OfferVersionConflictError extends Error {
  readonly code = "OFFER_VERSION_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(
    public readonly offerId: string,
    public readonly expectedVersion: number
  ) {
    super(
      `Concurrent modification on offer ${offerId} (expected version ${expectedVersion})`
    );
    this.name = "OfferVersionConflictError";
  }
}

export class ListingSaleConflictError extends Error {
  readonly code = "LISTING_SALE_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(public readonly listingId: string) {
    super(
      `Listing ${listingId} already has an AGREED (or later) sale — unavailable`
    );
    this.name = "ListingSaleConflictError";
  }
}

export class OfferIdempotencyConflictError extends Error {
  readonly code = "OFFER_IDEMPOTENCY_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(public readonly idempotencyKey: string) {
    super(`Idempotency key conflict: ${idempotencyKey}`);
    this.name = "OfferIdempotencyConflictError";
  }
}
