import type Stripe from "stripe";
import { appOrigin, getStripe } from "./stripe-client.js";

const PORTAL_FEATURES: Stripe.BillingPortal.ConfigurationCreateParams["features"] =
  {
    customer_update: {
      enabled: true,
      allowed_updates: ["email", "address"],
    },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
    },
    subscription_update: { enabled: false },
  };

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.deleted",
];

function webhookApiUrl(): string {
  const explicit = process.env.STRIPE_WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  const apiBase = process.env.PUBLIC_API_URL?.trim();
  if (apiBase) return `${apiBase.replace(/\/$/, "")}/api/billing/webhook`;
  return "https://vauto-api.onrender.com/api/billing/webhook";
}

export async function ensureStripePortalConfiguration(): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return false;

  const existing = await stripe.billingPortal.configurations.list({ limit: 5 });
  if (existing.data.length > 0) {
    const active = existing.data.find((c) => c.active);
    if (active) return true;
  }

  await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Vauto — prenumeratos valdymas",
    },
    default_return_url: `${appOrigin()}/profile`,
    features: PORTAL_FEATURES,
  });

  console.log("[Stripe] Customer Portal configuration created (test/live).");
  return true;
}

export async function ensureStripeWebhookEndpoint(): Promise<{
  created: boolean;
  secret?: string;
  url: string;
}> {
  const stripe = getStripe();
  if (!stripe) return { created: false, url: webhookApiUrl() };

  const url = webhookApiUrl();
  const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
  const match = endpoints.data.find((e) => e.url === url && e.status !== "disabled");

  if (match) {
    return { created: false, url };
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
    description: "Vauto billing (checkout + subscription cancel)",
  });

  console.log(`[Stripe] Webhook endpoint created: ${url}`);
  if (endpoint.secret) {
    console.log(
      "[Stripe] Add STRIPE_WEBHOOK_SECRET to Render (shown once):",
      endpoint.secret
    );
  }

  return { created: true, secret: endpoint.secret ?? undefined, url };
}

export async function runStripeBootstrap(): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;

  try {
    await ensureStripePortalConfiguration();
  } catch (e) {
    console.warn("[Stripe] Portal setup failed:", String(e));
  }

  if (process.env.STRIPE_AUTO_WEBHOOK === "1") {
    try {
      await ensureStripeWebhookEndpoint();
    } catch (e) {
      console.warn("[Stripe] Webhook setup failed:", String(e));
    }
  }
}
