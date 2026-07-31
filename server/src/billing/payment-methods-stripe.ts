/**
 * Stripe helpers for saved payment methods (1-click checkout) and Connect
 * payout onboarding.
 *
 * SECURITY: card data is collected exclusively on Stripe-hosted Checkout in
 * `setup` mode, and IBANs exclusively during Connect onboarding. VAUTO only ever
 * receives Stripe object ids plus masked tails for display.
 */
import type Stripe from "stripe";
import { appOrigin, getStripe } from "./stripe-client.js";

export interface SavedCardDetails {
  paymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
}

export interface PayoutAccountDetails {
  connectAccountId: string;
  ibanLast4: string | null;
  holderName: string | null;
  status: "pending" | "verified" | "restricted";
}

function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new Error("STRIPE_SECRET_KEY not configured");
  return stripe;
}

/** Ensure the user has a Stripe Customer so a PaymentMethod can be attached. */
export async function ensureStripeCustomer(opts: {
  userId: string;
  email?: string;
  name?: string;
  existingCustomerId?: string;
}): Promise<string> {
  const stripe = requireStripe();

  if (opts.existingCustomerId) {
    try {
      const found = await stripe.customers.retrieve(opts.existingCustomerId);
      if (!("deleted" in found) || !found.deleted) return opts.existingCustomerId;
    } catch {
      // Customer vanished (e.g. test-data reset) — fall through and recreate.
    }
  }

  const created = await stripe.customers.create({
    email: opts.email,
    name: opts.name,
    metadata: { userId: opts.userId },
  });
  return created.id;
}

/**
 * Stripe-hosted Checkout in `setup` mode: collects and vaults a card without
 * charging it, so later escrow payments can be 1-click.
 */
export async function createPaymentMethodSetupSession(opts: {
  userId: string;
  customerId: string;
  returnPath?: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = requireStripe();
  const back = opts.returnPath ?? "/profile/settings/";

  return stripe.checkout.sessions.create({
    mode: "setup",
    customer: opts.customerId,
    payment_method_types: ["card"],
    metadata: {
      kind: "payment_method_setup",
      userId: opts.userId,
    },
    success_url: `${appOrigin()}${back}?payment=saved&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin()}${back}?payment=cancel`,
  });
}

function readCardDetails(pm: Stripe.PaymentMethod): SavedCardDetails | null {
  if (!pm.card) return null;
  return {
    paymentMethodId: pm.id,
    brand: pm.card.brand ?? "card",
    last4: pm.card.last4 ?? "",
    expMonth: pm.card.exp_month ?? null,
    expYear: pm.card.exp_year ?? null,
  };
}

/**
 * Resolve the vaulted card from a completed `setup` Checkout Session and make
 * it the customer's default for future off-session charges.
 */
export async function resolveSetupSessionCard(
  sessionId: string
): Promise<{ userId?: string; customerId?: string; card: SavedCardDetails | null }> {
  const stripe = requireStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["setup_intent"],
  });

  const userId = session.metadata?.userId ?? undefined;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  const setupIntent = session.setup_intent;
  const paymentMethodRef =
    setupIntent && typeof setupIntent !== "string"
      ? setupIntent.payment_method
      : null;
  const paymentMethodId =
    typeof paymentMethodRef === "string" ? paymentMethodRef : paymentMethodRef?.id;

  if (!paymentMethodId) return { userId, customerId, card: null };

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (customerId) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  return { userId, customerId, card: readCardDetails(pm) };
}

export async function detachPaymentMethod(paymentMethodId: string): Promise<void> {
  const stripe = requireStripe();
  try {
    await stripe.paymentMethods.detach(paymentMethodId);
  } catch (e) {
    // Already detached / unknown id — treat as success so the DB can be cleared.
    console.warn("[payment-methods] detach failed:", String(e));
  }
}

/**
 * Express Connect onboarding — Stripe collects and holds the seller's IBAN and
 * identity documents. We only read back the masked tail.
 */
export async function createPayoutOnboardingLink(opts: {
  userId: string;
  email?: string;
  existingAccountId?: string;
  returnPath?: string;
}): Promise<{ accountId: string; url: string }> {
  const stripe = requireStripe();
  const back = opts.returnPath ?? "/profile/settings/";

  let accountId = opts.existingAccountId;
  if (accountId) {
    try {
      await stripe.accounts.retrieve(accountId);
    } catch {
      accountId = undefined;
    }
  }

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "LT",
      email: opts.email,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { userId: opts.userId },
    });
    accountId = account.id;
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${appOrigin()}${back}?payout=retry`,
    return_url: `${appOrigin()}${back}?payout=done`,
  });

  return { accountId, url: link.url };
}

/** Read masked payout details straight from Connect — nothing is cached in Stripe calls. */
export async function readPayoutAccount(
  accountId: string
): Promise<PayoutAccountDetails | null> {
  const stripe = requireStripe();

  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(accountId);
  } catch (e) {
    console.warn("[payout] account retrieve failed:", String(e));
    return null;
  }

  const external = account.external_accounts?.data?.find(
    (acc): acc is Stripe.BankAccount => acc.object === "bank_account"
  );

  const status: PayoutAccountDetails["status"] = account.payouts_enabled
    ? "verified"
    : account.requirements?.disabled_reason
      ? "restricted"
      : "pending";

  return {
    connectAccountId: accountId,
    ibanLast4: external?.last4 ?? null,
    holderName: external?.account_holder_name ?? null,
    status,
  };
}
