import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { subscribeUserPlan } from "../repository.js";

export const billingRouter = Router();

const VALID_PLANS = new Set(["starter", "pro"]);

billingRouter.post("/subscribe", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const planId = String((req.body as { planId?: string })?.planId ?? "");
    if (!VALID_PLANS.has(planId)) {
      return res.status(400).json({ error: "Invalid planId" });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      return res.status(501).json({
        error: "Stripe checkout is configured but not wired yet. Use demo mode without STRIPE_SECRET_KEY.",
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
