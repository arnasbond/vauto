import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { optionalAuth } from "../middleware/auth.js";
import { importWardrobeProfile } from "../ai/wardrobe-profile-importer.js";

export const spintaRouter = Router();

spintaRouter.use(optionalAuth);

/** Wardrobe profile import — authenticated-friendly tier (50/min). */
spintaRouter.post("/import", async (req: AuthedRequest, res) => {
  const body = req.body as {
    profileUrl?: string;
    userName?: string;
    defaultLocation?: string;
  };
  if (!body.profileUrl?.trim()) {
    return res.status(400).json({ error: "profileUrl is required" });
  }
  try {
    const result = await importWardrobeProfile({
      profileUrl: body.profileUrl.trim(),
      userName: body.userName,
      defaultLocation: body.defaultLocation,
    });
    res.json(result);
  } catch (e) {
    res.status(422).json({ error: String(e) });
  }
});

/**
 * Background wardrobe sync — cron (every 6h) via X-Cron-Secret, or authed user refresh.
 * Re-imports linked profile and returns job metadata for future queue workers.
 */
spintaRouter.post("/sync", async (req: AuthedRequest, res) => {
  const cronSecret = process.env.SPINTA_SYNC_CRON_SECRET?.trim();
  const cronHeader = req.headers["x-cron-secret"];
  const isCron =
    Boolean(cronSecret) && typeof cronHeader === "string" && cronHeader === cronSecret;

  const body = req.body as {
    profileUrl?: string;
    userName?: string;
    defaultLocation?: string;
    userId?: string;
  };

  if (!isCron && !req.authUserId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const profileUrl = body.profileUrl?.trim();
  if (!profileUrl) {
    return res.status(400).json({ error: "profileUrl is required" });
  }

  try {
    const result = await importWardrobeProfile({
      profileUrl,
      userName: body.userName,
      defaultLocation: body.defaultLocation,
    });
    res.json({
      ok: true,
      status: "synced",
      triggeredBy: isCron ? "cron" : "user",
      userId: body.userId ?? req.authUserId ?? null,
      itemCount: result.items.length,
      profileUrl: result.profileUrl,
      nextSyncInHours: 6,
      items: result.items,
      voiceAnnouncement: result.voiceAnnouncement,
    });
  } catch (e) {
    res.status(422).json({ ok: false, status: "error", error: String(e) });
  }
});
