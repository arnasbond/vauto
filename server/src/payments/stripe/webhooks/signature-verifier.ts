/**
 * Cryptographic Stripe webhook signature verification on RAW body bytes.
 * MUST run before any JSON parse mutation of the body.
 *
 * Stage 11J.5 — runtime capability: only the object returned by
 * Stripe.webhooks.constructEvent() inside this module is signature-verified.
 * `as Stripe.Event` / `as VerifiedStripeEvent` does not grant that capability.
 */

import Stripe from "stripe";
import {
  StripeWebhookConfigError,
  StripeWebhookSignatureError,
} from "./types.js";

/**
 * Identity set of objects actually returned by constructEvent() here.
 * Not exported. There is no public mark/register API.
 */
const SIGNATURE_VERIFIED_STRIPE_EVENTS = new WeakSet<object>();

/** TypeScript alias only — runtime proof is SIGNATURE_VERIFIED_STRIPE_EVENTS. */
export type VerifiedStripeEvent = Stripe.Event;

/**
 * Read-only predicate. Cannot add an event to the registry.
 */
export function isSignatureVerifiedStripeEvent(
  value: unknown
): value is VerifiedStripeEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    SIGNATURE_VERIFIED_STRIPE_EVENTS.has(value)
  );
}

/**
 * Verify Stripe-Signature against exact raw HTTP body bytes.
 * Invalid / missing signature → StripeWebhookSignatureError (400).
 * On success the constructEvent() result is the sole runtime-verified event.
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
    const event = Stripe.webhooks.constructEvent(
      input.rawBody,
      signature,
      secret
    );
    SIGNATURE_VERIFIED_STRIPE_EVENTS.add(event);
    return event;
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
