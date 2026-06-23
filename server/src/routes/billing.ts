import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getUser, subscribeUserPlan } from "../repository.js";
import {
  createPlanCheckoutSession,
  getStripe,
} from "../billing/stripe-client.js";
import type { StripePlanId } from "../billing/stripe-plans.js";

export const billingRouter = Router();

const VALID_PLANS = new Set<string>(["starter", "pro"]);

billingRouter.post("/subscribe", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const planId = String((req.body as { planId?: string })?.planId ?? "");
    if (!VALID_PLANS.has(planId)) {
      return res.status(400).json({ error: "Invalid planId" });
    }

    const stripe = getStripe();
    if (stripe) {
      const user = await getUser(req.authUserId!);
      const session = await createPlanCheckoutSession({
        userId: req.authUserId!,
        planId: planId as StripePlanId,
        email: user?.email,
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    if (userId && planId && VALID_PLANS.has(planId)) {
      await subscribeUserPlan(userId, planId, session.id);
    }
  }

  res.json({ received: true });
}
