import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  calculateBuyerProtectionFee,
  calculateBuyerTotal,
  resolveEscrowPaymentIntentId,
} from "../billing/stripe-b2b.js";
import {
  applyListingPromotePaid,
  cancelUserBillingByStripeCustomer,
  getListingForEmbedding,
  getUser,
  getUserStripeCustomerId,
  listBillingInvoicesForUser,
  markEscrowPaidFromStripe,
  subscribeUserPlan,
} from "../repository.js";
import {
  createBillingPortalSession,
  createPlanCheckoutSession,
  createPromoteCheckoutSession,
  getStripe,
  resolveStripeCustomerId,
} from "../billing/stripe-client.js";
import type { StripePlanId } from "../billing/stripe-plans.js";
import { STRIPE_PLANS } from "../billing/stripe-plans.js";
import { claimStripeWebhookEvent } from "../billing/webhook-idempotency.js";
import {
  normalizePromoteTier,
  resolvePromotePriceEur,
  b2cProductToPromoteTier,
} from "../billing/promote-pricing.js";
import { persistInvoiceFromCheckoutSession } from "../billing/persist-invoice.js";

export const billingRouter = Router();

const VALID_PLANS = new Set<string>(["starter", "pro", "enterprise"]);

billingRouter.post("/confirm", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const sessionId = String(
      (req.body as { sessionId?: string })?.sessionId ?? ""
    );
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe not configured" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Payment not completed" });
    }

    try {
      await persistInvoiceFromCheckoutSession(session);
    } catch (e) {
      console.error("Invoice persist on confirm failed:", e);
    }

    const userId = session.metadata?.userId;
    if (!userId || userId !== req.authUserId) {
      return res.status(403).json({ error: "Session does not belong to user" });
    }

    if (session.metadata?.kind === "b2c_promote") {
      const listingId = session.metadata.listingId;
      const tier = normalizePromoteTier(session.metadata.tier);
      if (!listingId) {
        return res.status(400).json({ error: "Missing listingId in session" });
      }
      const listing = await applyListingPromotePaid({
        userId,
        listingId,
        tier,
        stripeSessionId: session.id,
      });
      if (!listing) {
        return res.status(404).json({ error: "Listing not found" });
      }
      return res.json({
        ok: true,
        mode: "stripe_promote",
        kind: "b2c_promote",
        listing,
        tier,
        productId: session.metadata.productId || undefined,
        message: "Skelbimo iškėlimas aktyvuotas!",
      });
    }

    const planId = session.metadata?.planId;
    if (!planId || !VALID_PLANS.has(planId)) {
      return res.status(400).json({ error: "Invalid plan in session" });
    }

    const customerId = resolveStripeCustomerId(session.customer);
    const user = await subscribeUserPlan(
      userId,
      planId,
      session.id,
      customerId
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      ok: true,
      mode: "stripe",
      user,
      planId,
      message:
        planId === "enterprise"
          ? "Enterprise planas aktyvuotas!"
          : planId === "pro"
            ? "Pro planas aktyvuotas!"
            : "Starto planas aktyvuotas!",
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Stripe Checkout for B2C listing promote (card payment → webhook/confirm → DB). */
billingRouter.post("/promote-checkout", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = req.body as {
      listingId?: string;
      tier?: number;
      productId?: string;
    };
    const listingId = String(body?.listingId ?? "").trim();
    if (!listingId) {
      return res.status(400).json({ error: "listingId is required" });
    }

    const listing = await getListingForEmbedding(listingId);
    if (!listing || listing.sellerId !== req.authUserId) {
      return res.status(404).json({ error: "Listing not found" });
    }

    const tier =
      body?.productId != null && String(body.productId).trim()
        ? b2cProductToPromoteTier({ productId: String(body.productId) })
        : normalizePromoteTier(body?.tier);
    const amountEur = resolvePromotePriceEur({
      tier,
      category: listing.category,
    });

    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        error: "Stripe not configured",
        mode: "unavailable",
      });
    }

    const user = await getUser(req.authUserId!);
    const existingCustomerId = await getUserStripeCustomerId(req.authUserId!);
    const session = await createPromoteCheckoutSession({
      userId: req.authUserId!,
      listingId,
      listingTitle: listing.title,
      tier,
      amountEur,
      productId: body?.productId,
      email: user?.email,
      customerId: existingCustomerId ?? undefined,
    });
    if (!session.url) {
      return res.status(500).json({ error: "Stripe checkout URL missing" });
    }
    return res.json({
      ok: true,
      mode: "stripe",
      checkoutUrl: session.url,
      sessionId: session.id,
      amountEur,
      tier,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

billingRouter.post("/portal", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe not configured" });
    }

    const customerId = await getUserStripeCustomerId(req.authUserId!);
    if (!customerId) {
      return res.status(404).json({
        error: "Stripe klientas nerastas. Pirmiausia užsisakykite planą.",
      });
    }

    const session = await createBillingPortalSession(customerId);
    if (!session.url) {
      return res.status(500).json({ error: "Portal URL missing" });
    }

    res.json({ ok: true, portalUrl: session.url });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

billingRouter.get("/invoices", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const invoices = await listBillingInvoicesForUser(req.authUserId!);
    res.json({ ok: true, invoices });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

billingRouter.post("/subscribe", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const planId = String((req.body as { planId?: string })?.planId ?? "");
    if (!VALID_PLANS.has(planId)) {
      return res.status(400).json({ error: "Invalid planId" });
    }

    const plan = STRIPE_PLANS[planId as StripePlanId];
    // First Month Free launch — activate immediately at 0 € (Stripe rejects 0 unit_amount).
    if (plan.amount <= 0) {
      const user = await subscribeUserPlan(req.authUserId!, planId);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json({
        ok: true,
        mode: "launch_promo",
        user,
        amountEur: 0,
        message: "Starto akcija: Pirmas mėnuo NEMOKAMAI! Planas aktyvuotas.",
      });
    }

    const stripe = getStripe();
    if (stripe) {
      const user = await getUser(req.authUserId!);
      const existingCustomerId = await getUserStripeCustomerId(req.authUserId!);
      const session = await createPlanCheckoutSession({
        userId: req.authUserId!,
        planId: planId as StripePlanId,
        email: user?.email,
        customerId: existingCustomerId ?? undefined,
      });
      if (!session.url) {
        return res.status(500).json({ error: "Stripe checkout URL missing" });
      }
      return res.json({
        ok: true,
        mode: "stripe",
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    }

    const user = await subscribeUserPlan(req.authUserId!, planId);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      ok: true,
      mode: "local",
      user,
      message:
        planId === "enterprise"
          ? "Enterprise planas aktyvuotas."
          : planId === "pro"
            ? "Pro planas aktyvuotas."
            : "Starto planas užregistruotas.",
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export async function handleStripeWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = req.headers["stripe-signature"];

  if (!stripe || !secret) {
    res.status(503).send("Stripe webhook not configured");
    return;
  }
  if (!signature || typeof signature !== "string") {
    res.status(400).send("Missing stripe-signature");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, secret);
  } catch (e) {
    res.status(400).send(`Webhook Error: ${String(e)}`);
    return;
  }

  // Idempotency: Stripe retries webhooks; process each event id at most once.
  try {
    const isNew = await claimStripeWebhookEvent(event.id, event.type);
    if (!isNew) {
      res.json({ received: true, duplicate: true });
      return;
    }
  } catch (e) {
    console.error("Webhook idempotency check failed:", e);
    res.status(500).send("Webhook idempotency error");
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      await persistInvoiceFromCheckoutSession(session);
    } catch (e) {
      console.error("Invoice persist failed:", e);
    }
    if (session.metadata?.kind === "escrow" && session.metadata.escrowId) {
      try {
        const { paymentIntentId } = await resolveEscrowPaymentIntentId(session.id);
        const escrowId = session.metadata.escrowId;
        const itemAmount = Number(session.metadata.itemAmountEur ?? 0);
        const fee = Number(session.metadata.buyerProtectionFeeEur ?? 0);
        const buyerProtectionFee =
          fee > 0 ? fee : calculateBuyerProtectionFee(itemAmount);
        const buyerTotal =
          session.amount_total != null
            ? session.amount_total / 100
            : calculateBuyerTotal(itemAmount);
        await markEscrowPaidFromStripe({
          escrowId,
          paymentIntentId,
          buyerProtectionFee,
          buyerTotal,
        });
      } catch (e) {
        console.error("Escrow webhook mark paid failed:", e);
      }
    } else if (
      session.metadata?.kind === "b2c_promote" &&
      session.metadata.listingId &&
      session.metadata.userId
    ) {
      try {
        const tier = normalizePromoteTier(session.metadata.tier);
        const listing = await applyListingPromotePaid({
          userId: session.metadata.userId,
          listingId: session.metadata.listingId,
          tier,
          stripeSessionId: session.id,
        });
        if (!listing) {
          console.error(
            "Promote webhook: listing not found",
            session.metadata.listingId
          );
        }
      } catch (e) {
        console.error("Promote webhook apply failed:", e);
      }
    } else {
      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId;
      const customerId = resolveStripeCustomerId(session.customer);
      if (userId && planId && VALID_PLANS.has(planId)) {
        await subscribeUserPlan(userId, planId, session.id, customerId);
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = resolveStripeCustomerId(subscription.customer);
    if (customerId) {
      await cancelUserBillingByStripeCustomer(customerId);
    }
  }

  res.json({ received: true });
}
