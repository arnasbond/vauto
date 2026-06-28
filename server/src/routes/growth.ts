import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getUser, getUserNotifications } from "../repository.js";
import {
  applyReferralOnSignup,
  ensureUserReferralCode,
  getFreeProtectionCredits,
  resolveReferralCode,
} from "../referral/referral-service.js";

export const growthRouter = Router();

growthRouter.get("/notifications", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const items = await getUserNotifications(req.authUserId!, 40);
    res.json({ ok: true, notifications: items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

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
