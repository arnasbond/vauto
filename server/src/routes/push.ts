import { Router } from "express";
import {
  deletePushSubscription,
  setUserAlertQueries,
  upsertFcmToken,
  upsertPushSubscription,
} from "../repository.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getVapidPublicKey } from "../push/web-push.js";

export const pushRouter = Router();

pushRouter.get("/vapid-public-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.json({ enabled: false });
    return;
  }
  res.json({ enabled: true, publicKey: key });
});

pushRouter.post("/subscribe", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { endpoint, keys } = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: "Invalid subscription" });
      return;
    }
    await upsertPushSubscription(req.authUserId!, {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

pushRouter.post("/unsubscribe", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const endpoint = String(req.body?.endpoint ?? "");
    if (!endpoint) {
      res.status(400).json({ error: "endpoint required" });
      return;
    }
    await deletePushSubscription(req.authUserId!, endpoint);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

pushRouter.put("/alert-queries", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const queries = Array.isArray(req.body?.queries)
      ? (req.body.queries as string[])
      : [];
    await setUserAlertQueries(req.authUserId!, queries);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

pushRouter.post("/fcm-token", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const token = String(req.body?.token ?? "").trim();
    const platform = String(req.body?.platform ?? "android");
    if (!token) {
      res.status(400).json({ error: "token required" });
      return;
    }
    await upsertFcmToken(req.authUserId!, token, platform);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
