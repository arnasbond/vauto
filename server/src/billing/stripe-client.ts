import Stripe from "stripe";
import { STRIPE_PLANS, type StripePlanId } from "./stripe-plans.js";

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
    ...(opts.customerId
      ? { customer: opts.customerId }
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
    return_url: `${appOrigin()}/profile`,
  });
}

export function resolveStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | undefined {
  if (!customer || typeof customer === "object" && "deleted" in customer) {
    return undefined;
  }
  return typeof customer === "string" ? customer : customer.id;
}
