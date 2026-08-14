/**
 * Cryptographic Stripe webhook signature verification on RAW body bytes.
 * MUST run before any JSON parse mutation of the body.
 */

import Stripe from "stripe";
import {
  StripeWebhookConfigError,
  StripeWebhookSignatureError,
} from "./types.js";

export type VerifiedStripeEvent = Stripe.Event;

/**
 * Verify Stripe-Signature against exact raw HTTP body bytes.
 * Invalid / missing signature → StripeWebhookSignatureError (400).
 */
export function verifyStripeWebhookSignature(input: {
  rawBody: Buffer;
  signatureHeader: string | string[] | undefined;
  webhookSecret: string | undefined;
}): VerifiedStripeEvent {
  const secret = input.webhookSecret?.trim();
  if (!secret) {
    throw new StripeWebhookConfigError();
  }
  const signature = Array.isArray(input.signatureHeader)
    ? input.signatureHeader[0]
    : input.signatureHeader;
  if (!signature || !Buffer.isBuffer(input.rawBody)) {
    throw new StripeWebhookSignatureError("Missing signature or raw body");
  }

  try {
    // Stripe SDK accepts Buffer; bytes must match the signed payload exactly.
    return Stripe.webhooks.constructEvent(input.rawBody, signature, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "signature verification failed";
    throw new StripeWebhookSignatureError(msg);
  }
}

/** Test helper — produce a valid Stripe-Signature header for a payload string. */
export function generateTestStripeSignatureHeader(input: {
  payload: string;
  secret: string;
}): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload: input.payload,
    secret: input.secret,
  });
}

export function assertRawBodyUnmodified(
  rawBody: Buffer,
  expectedUtf8: string
): boolean {
  return rawBody.equals(Buffer.from(expectedUtf8, "utf8"));
}
