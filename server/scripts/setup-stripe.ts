/**
 * One-shot Stripe setup for Vauto (test or live key in env).
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/setup-stripe.ts
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_AUTO_WEBHOOK=1 npx tsx scripts/setup-stripe.ts
 */
import "dotenv/config";
import {
  ensureStripePortalConfiguration,
  ensureStripeWebhookEndpoint,
} from "../src/billing/ensure-stripe.js";
import { getStripe } from "../src/billing/stripe-client.js";

async function main() {
  const stripe = getStripe();
  if (!stripe) {
    console.error("Set STRIPE_SECRET_KEY in environment.");
    process.exit(1);
  }

  const account = await stripe.accounts.retrieve();
  console.log(`Stripe account: ${account.id} (${account.settings?.dashboard?.display_name ?? "Vauto"})`);

  const portalOk = await ensureStripePortalConfiguration();
  console.log(portalOk ? "✓ Customer Portal ready" : "✗ Portal setup failed");

  process.env.STRIPE_AUTO_WEBHOOK = "1";
  const webhook = await ensureStripeWebhookEndpoint();
  if (webhook.created && webhook.secret) {
    console.log("\n--- Copy to Render env ---");
    console.log(`STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
    console.log("--------------------------\n");
  } else if (!webhook.created) {
    console.log(`✓ Webhook already exists: ${webhook.url}`);
  }

  console.log("Done. Enable Customer Portal in Dashboard if sessions still fail:");
  console.log("https://dashboard.stripe.com/test/settings/billing/portal");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
