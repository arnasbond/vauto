export const FINANCIAL_OBLIGATION_TYPES = [
  "PURCHASE_PRICE",
  "RESERVATION_DEPOSIT",
  "SERVICE_DEPOSIT",
  "PLATFORM_FEE",
  "REFUND",
  "PAYOUT",
] as const;
export type FinancialObligationType = (typeof FINANCIAL_OBLIGATION_TYPES)[number];

export const FINANCIAL_OBLIGATION_STATUSES = [
  "CREATED",
  "HELD",
  "CAPTURED",
  "RELEASED",
  "REFUNDED",
  "CANCELLED",
] as const;
export type FinancialObligationStatus =
  (typeof FINANCIAL_OBLIGATION_STATUSES)[number];

export type FinancialObligation = {
  id: string;
  transactionId: string;
  type: FinancialObligationType;
  amountCents: number;
  currency: string;
  payerId: string;
  beneficiaryId: string;
  status: FinancialObligationStatus;
  paymentProviderRef: string | null;
  createdAt: string;
  idempotencyKey: string | null;
  sourceObligationId: string | null;
  paymentProvider: string | null;
  providerEventId: string | null;
  providerVerifiedAt: string | null;
};

export class ObligationLimitError extends Error {
  readonly code = "OBLIGATION_LIMIT" as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = "ObligationLimitError";
  }
}

/** Atomic cap abort (TOCTOU-safe). Subclass of ObligationLimitError. */
export class FinancialCapExceededError extends ObligationLimitError {
  readonly capCode = "FINANCIAL_CAP_EXCEEDED" as const;
  constructor(message: string) {
    super(message);
    this.name = "FinancialCapExceededError";
  }
}

export class ObligationNotFoundError extends Error {
  readonly code = "OBLIGATION_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(message = "Financial obligation not found") {
    super(message);
    this.name = "ObligationNotFoundError";
  }
}

/** Same Stripe event cannot verify two obligations. HTTP 409. */
export class ProviderEventReplayError extends Error {
  readonly code = "PROVIDER_EVENT_REPLAY" as const;
  readonly httpStatus = 409;
  constructor(public readonly providerEventId: string) {
    super(`Provider event already used: ${providerEventId}`);
    this.name = "ProviderEventReplayError";
  }
}

/** Provider payload does not match the locked obligation. HTTP 422. */
export class ProviderMetadataMismatchError extends Error {
  readonly code = "PROVIDER_METADATA_MISMATCH" as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = "ProviderMetadataMismatchError";
  }
}

/**
 * Provenance token was not minted from Stripe.webhooks.constructEvent().
 * HTTP 403 — capability boundary, not a metadata mismatch.
 */
export class UntrustedProviderProvenanceError extends Error {
  readonly code = "UNTRUSTED_PROVIDER_PROVENANCE" as const;
  readonly httpStatus = 403;
  constructor(
    message = "provider_verified_at can only be set from a signature-verified Stripe event"
  ) {
    super(message);
    this.name = "UntrustedProviderProvenanceError";
  }
}
