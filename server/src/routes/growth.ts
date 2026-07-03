import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  getUser,
  getUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from "../repository.js";
import {
  applyReferralOnSignup,
  ensureUserReferralCode,
  getFreeProtectionCredits,
  resolveReferralCode,
} from "../referral/referral-service.js";

export const growthRouter = Router();

growthRouter.get("/notifications", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 40));
    const items = await getUserNotifications(req.authUserId!, limit);
    const unreadCount = items.filter((n) => !n.readAt).length;
    res.json({ ok: true, notifications: items, unreadCount });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

growthRouter.post(
  "/notifications/:id/read",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const ok = await markUserNotificationRead(
        req.authUserId!,
        req.params.id
      );
      if (!ok) return res.status(404).json({ error: "Notification not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

growthRouter.post(
  "/notifications/read-all",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const count = await markAllUserNotificationsRead(req.authUserId!);
      res.json({ ok: true, marked: count });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

growthRouter.get("/referral/me", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.authUserId!;
    const code = await ensureUserReferralCode(userId);
    const credits = await getFreeProtectionCredits(userId);
    res.json({ ok: true, referralCode: code, freeProtectionCredits: credits });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

growthRouter.post("/referral/apply", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const code = String((req.body as { code?: string })?.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "code is required" });
    const userId = req.authUserId!;
    const referrerId = await resolveReferralCode(code);
    if (!referrerId) return res.status(404).json({ error: "Referral kodas nerastas" });
    if (referrerId === userId) {
      return res.status(400).json({ error: "Negalite naudoti savo kodo" });
    }
    await applyReferralOnSignup(userId, code);
    const user = await getUser(userId);
    res.json({
      ok: true,
      message: "Referral kodas pritaikytas — gausite nemokamą pirkėjo apsaugą!",
      freeProtectionCredits: user?.freeProtectionCredits ?? 0,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

growthRouter.post("/referral/validate", async (req, res) => {
  try {
    const code = String((req.body as { code?: string })?.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "code is required" });
    const referrerId = await resolveReferralCode(code);
    res.json({ ok: Boolean(referrerId), valid: Boolean(referrerId) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
