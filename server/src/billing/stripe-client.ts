import Stripe from "stripe";
import { STRIPE_PLANS, type StripePlanId } from "./stripe-plans.js";
import { checkoutBuyerCollectionParams } from "./checkout-payment-methods.js";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export function appOrigin(): string {
  return (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function createPlanCheckoutSession(opts: {
  userId: string;
  planId: StripePlanId;
  email?: string;
  customerId?: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY not configured");

  const plan = STRIPE_PLANS[opts.planId];

  return stripe.checkout.sessions.create({
    mode: "subscription",
    ...checkoutBuyerCollectionParams("subscription"),
    ...(opts.customerId
      ? {
          customer: opts.customerId,
          customer_update: { name: "auto", address: "auto" },
        }
      : { customer_email: opts.email }),
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: plan.label },
          unit_amount: plan.amount,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: "b2b_subscription",
      userId: opts.userId,
      planId: opts.planId,
    },
    success_url: `${appOrigin()}/profile?billing=success&plan=${opts.planId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin()}/profile?billing=cancel`,
  });
}

export async function createBillingPortalSession(
  customerId: string
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY not configured");

  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appOrigin()}/profile/settings`,
  });
}

/** One-time Stripe Checkout for B2C listing promote / boost. */
export async function createPromoteCheckoutSession(opts: {
  userId: string;
  listingId: string;
  listingTitle: string;
  tier: number;
  amountEur: number;
  productId?: string;
  email?: string;
  customerId?: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY not configured");

  const unitAmount = Math.max(1, Math.round(opts.amountEur * 100));
  const tier = String(Math.min(5, Math.max(1, Math.floor(opts.tier))));

  return stripe.checkout.sessions.create({
    mode: "payment",
    ...checkoutBuyerCollectionParams("payment"),
    ...(opts.customerId
      ? {
          customer: opts.customerId,
          customer_update: { name: "auto", address: "auto" },
        }
      : opts.email
        ? { customer_email: opts.email }
        : {}),
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: opts.listingTitle
              ? `VAUTO iškėlimas — ${opts.listingTitle}`
              : "VAUTO skelbimo iškėlimas",
            description: `Matomumo lygis ${tier}`,
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: "b2c_promote",
      userId: opts.userId,
      listingId: opts.listingId,
      tier,
      productId: opts.productId ?? "",
    },
    success_url: `${appOrigin()}/profile?promote=success&listing=${encodeURIComponent(opts.listingId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin()}/profile?promote=cancel&listing=${encodeURIComponent(opts.listingId)}`,
  });
}

export function resolveStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | undefined {
  if (!customer || (typeof customer === "object" && "deleted" in customer)) {
    return undefined;
  }
  return typeof customer === "string" ? customer : customer.id;
}
