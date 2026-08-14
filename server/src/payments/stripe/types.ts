/**
 * Stage 11F.2 — Stripe PaymentIntent integration types.
 */

import type { STRIPE_INTEGRATION_VERSION } from "./version.js";

export type StripeProviderPaymentIntent = {
  id: string;
  clientSecret: string;
  status: string;
  amountCents: number;
  currency: "eur";
};

export type StripeProviderTransfer = {
  id: string;
  amountCents: number;
  currency: "eur";
  destinationAccountId: string;
  status: string;
  /** Stage 11F.6 — filter by transaction / payment intent in FakeStripe. */
  metadata?: Record<string, string>;
  sourcePaymentIntentId?: string | null;
};

export type StripeProviderRefund = {
  id: string;
  amountCents: number;
  paymentIntentId: string;
  status: string;
};

export type StripeProviderTransferReversal = {
  id: string;
  transferId: string;
  amountCents: number;
  status: string;
};

export type CreateStripePaymentIntentInput = {
  amountCents: number;
  currency: "eur";
  idempotencyKey: string;
  metadata: {
    vautoPaymentIntentId: string;
    vautoTransactionId: string;
    vautoDealSnapshotId: string;
    buyerId: string;
    sellerId: string;
    acceptedOfferId: string;
  };
};

export type CreateStripeTransferInput = {
  amountCents: number;
  currency: "eur";
  destinationAccountId: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

export type CreateStripeRefundInput = {
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
};

export type CreateStripeTransferReversalInput = {
  transferId: string;
  amountCents: number;
  idempotencyKey: string;
};

export type StripeSafeClientResponse = {
  clientSecret: string;
  stripePaymentIntentId: string;
  status: string;
  amountCents: number;
  currency: "EUR";
  idempotentReplay: boolean;
  stripeIntegrationVersion: typeof STRIPE_INTEGRATION_VERSION;
};

export class StripeProviderError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  constructor(
    message: string,
    opts: { code?: string; httpStatus?: number } = {}
  ) {
    super(message);
    this.name = "StripeProviderError";
    this.code = opts.code ?? "STRIPE_PROVIDER_ERROR";
    this.httpStatus = opts.httpStatus ?? 502;
  }
}

export class StripeProviderTimeoutError extends StripeProviderError {
  constructor(message = "Stripe provider timeout") {
    super(message, { code: "STRIPE_PROVIDER_TIMEOUT", httpStatus: 504 });
    this.name = "StripeProviderTimeoutError";
  }
}

export type PaymentProvider = {
  readonly name: "fake" | "stripe";
  createPaymentIntent(
    input: CreateStripePaymentIntentInput
  ): Promise<StripeProviderPaymentIntent>;
  /** Optional retrieve for crash-recovery diagnostics (fake + real). */
  retrievePaymentIntent?(
    providerId: string
  ): Promise<StripeProviderPaymentIntent | null>;
  /** Stage 11F.4 — Connect Separate Charges and Transfers. */
  createTransfer(
    input: CreateStripeTransferInput
  ): Promise<StripeProviderTransfer>;
  createRefund(input: CreateStripeRefundInput): Promise<StripeProviderRefund>;
  createTransferReversal(
    input: CreateStripeTransferReversalInput
  ): Promise<StripeProviderTransferReversal>;
};
