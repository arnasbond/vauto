import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  calculateBuyerProtectionFee,
  calculateBuyerTotal,
  resolveEscrowPaymentIntentId,
} from "../billing/stripe-b2b.js";
import {
  cancelUserBillingByStripeCustomer,
  getUser,
  getUserStripeCustomerId,
  markEscrowPaidFromStripe,
  subscribeUserPlan,
} from "../repository.js";
import {
  createBillingPortalSession,
  createPlanCheckoutSession,
  getStripe,
  resolveStripeCustomerId,
} from "../billing/stripe-client.js";
import type { StripePlanId } from "../billing/stripe-plans.js";
import { claimStripeWebhookEvent } from "../billing/webhook-idempotency.js";

export const billingRouter = Router();

const VALID_PLANS = new Set<string>(["starter", "pro"]);

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

    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    if (!userId || userId !== req.authUserId) {
      return res.status(403).json({ error: "Session does not belong to user" });
    }
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
        planId === "pro"
          ? "Pro planas aktyvuotas!"
          : "Starto planas aktyvuotas!",
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

billingRouter.post("/subscribe", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const planId = String((req.body as { planId?: string })?.planId ?? "");
    if (!VALID_PLANS.has(planId)) {
      return res.status(400).json({ error: "Invalid planId" });
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
      mode: "demo",
      user,
      message:
        planId === "pro"
          ? "Pro planas aktyvuotas (demo režimas)."
          : "Starto planas užregistruotas (demo režimas).",
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
