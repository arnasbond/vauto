import type Stripe from "stripe";
import { appOrigin, getStripe } from "./stripe-client.js";

/** Platform buyer protection fee — 5% of negotiated item price. */
export const BUYER_PROTECTION_FEE_PERCENT = 5;

export function calculateBuyerProtectionFee(amountEur: number): number {
  const fee = (amountEur * BUYER_PROTECTION_FEE_PERCENT) / 100;
  return Math.round(Math.max(0.01, fee) * 100) / 100;
}

export function calculateBuyerTotal(amountEur: number): number {
  const fee = calculateBuyerProtectionFee(amountEur);
  return Math.round((amountEur + fee) * 100) / 100;
}

export function buyerProtectionExplanation(): string {
  return (
    "Šis mokestis garantuoja visišką pinigų grąžinimą, jei prekė neatitiks nuotraukos."
  );
}

/** Production escrow when Stripe secret is configured (override with STRIPE_CONNECT_ESCROW=false). */
export function isStripeEscrowLive(): boolean {
  if (process.env.STRIPE_CONNECT_ESCROW === "false") return false;
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export async function createEscrowCheckoutSession(opts: {
  escrowId: string;
  threadId: string;
  listingTitle: string;
  buyerId: string;
  sellerConnectAccountId?: string | null;
  amountEur: number;
  buyerProtectionFeeEur: number;
  buyerTotalEur: number;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY not configured");

  const buyerTotalCents = Math.round(opts.buyerTotalEur * 100);
  const platformFeeCents = Math.round(opts.buyerProtectionFeeEur * 100);

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    capture_method: "manual",
    metadata: {
      kind: "escrow",
      escrowId: opts.escrowId,
      threadId: opts.threadId,
      buyerId: opts.buyerId,
      itemAmountEur: String(opts.amountEur),
      buyerProtectionFeeEur: String(opts.buyerProtectionFeeEur),
    },
  };

  if (opts.sellerConnectAccountId) {
    paymentIntentData.application_fee_amount = platformFeeCents;
    paymentIntentData.transfer_data = {
      destination: opts.sellerConnectAccountId,
    };
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_intent_data: paymentIntentData,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: opts.listingTitle || "VAUTO saugus pirkimas",
            description: `Prekė ${opts.amountEur.toFixed(2)} € + ${BUYER_PROTECTION_FEE_PERCENT}% pirkėjo apsauga`,
          },
          unit_amount: buyerTotalCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: "escrow",
      escrowId: opts.escrowId,
      threadId: opts.threadId,
      buyerId: opts.buyerId,
      itemAmountEur: String(opts.amountEur),
      buyerProtectionFeeEur: String(opts.buyerProtectionFeeEur),
    },
    success_url: `${appOrigin()}/pokalbiai/?escrow=success&thread=${encodeURIComponent(opts.threadId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin()}/pokalbiai/?escrow=cancel&thread=${encodeURIComponent(opts.threadId)}`,
  });
}

/**
 * Release held funds to seller after buyer confirms delivery.
 * Uses Stripe manual capture on the platform-held PaymentIntent.
 */
export async function confirmDelivery(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY not configured");

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status === "succeeded") return pi;
  if (pi.status !== "requires_capture") {
    throw new Error(`PaymentIntent ${paymentIntentId} cannot be captured (status: ${pi.status})`);
  }
  return stripe.paymentIntents.capture(paymentIntentId);
}

export async function resolveEscrowPaymentIntentId(
  sessionId: string
): Promise<{ paymentIntentId: string; escrowId?: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY not configured");

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  const pi = session.payment_intent;
  const paymentIntentId =
    typeof pi === "string" ? pi : pi && typeof pi === "object" ? pi.id : undefined;
  if (!paymentIntentId) {
    throw new Error("Checkout session missing payment_intent");
  }
  return {
    paymentIntentId,
    escrowId: session.metadata?.escrowId,
  };
}
