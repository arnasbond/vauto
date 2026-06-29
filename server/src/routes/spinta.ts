import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { importWardrobeProfile } from "../ai/wardrobe-profile-importer.js";
import {
  detectPortalKeyFromUrl,
  isPortalProfileUrl,
  portalLabelForKey,
} from "../lib/portal-profile-url.js";
import {
  deletePortalLink,
  getPortalLinksForUser,
  upsertPortalLink,
} from "../repository-portal-links.js";
import { syncSinglePortalLink, runPortalSyncBatch } from "../spinta/portal-sync-service.js";
import { hashWardrobeItems, wardrobeItemsToListings } from "../spinta/portal-listing-mapper.js";
import { getUser, upsertPortalListing } from "../repository.js";
import { logProductionError } from "../lib/production-log.js";

export const spintaRouter = Router();

spintaRouter.use(optionalAuth);

/** List user's linked external portals. */
spintaRouter.get("/portals", requireAuth, async (req: AuthedRequest, res) => {
  const links = await getPortalLinksForUser(req.authUserId!);
  res.json({ links, syncCycleDays: 3 });
});

/** Link / update a portal profile URL — collapses to status chip on client. */
spintaRouter.put("/portals", requireAuth, async (req: AuthedRequest, res) => {
  const body = req.body as { portalKey?: string; profileUrl?: string };
  const profileUrl = body.profileUrl?.trim();
  if (!profileUrl) {
    return res.status(400).json({ error: "profileUrl is required" });
  }

  const portalKey = body.portalKey?.trim() || detectPortalKeyFromUrl(profileUrl);
  if (!portalKey || !isPortalProfileUrl(profileUrl, portalKey)) {
    return res.status(400).json({ error: "Netinkama portalo profilio nuoroda" });
  }

  const link = await upsertPortalLink({
    userId: req.authUserId!,
    portalKey,
    portalLabel: portalLabelForKey(portalKey),
    profileUrl,
    status: "syncing",
    scheduleNextSync: false,
  });

  res.json({ link });
});

spintaRouter.delete("/portals/:portalKey", requireAuth, async (req: AuthedRequest, res) => {
  const ok = await deletePortalLink(req.authUserId!, req.params.portalKey!);
  if (!ok) return res.status(404).json({ error: "Portal link not found" });
  res.json({ ok: true });
});

/** Wardrobe profile import — authenticated-friendly tier (50/min). */
spintaRouter.post("/import", async (req: AuthedRequest, res) => {
  const body = req.body as {
    profileUrl?: string;
    userName?: string;
    defaultLocation?: string;
    portalKey?: string;
    persistLink?: boolean;
  };
  if (!body.profileUrl?.trim()) {
    return res.status(400).json({ error: "profileUrl is required" });
  }

  const profileUrl = body.profileUrl.trim();
  const portalKey = body.portalKey?.trim() || detectPortalKeyFromUrl(profileUrl);

  try {
    const result = await importWardrobeProfile({
      profileUrl,
      userName: body.userName,
      defaultLocation: body.defaultLocation,
    });

    if (req.authUserId && body.persistLink !== false && portalKey) {
      const itemHash = hashWardrobeItems(result.items);
      const user = await getUser(req.authUserId);
      if (user) {
        const listings = wardrobeItemsToListings(
          user,
          result.items,
          portalKey,
          result.profileUrl
        );
        for (const listing of listings) {
          await upsertPortalListing(listing);
        }
      }

      await upsertPortalLink({
        userId: req.authUserId,
        portalKey,
        portalLabel: portalLabelForKey(portalKey),
        profileUrl: result.profileUrl,
        status: "synced",
        itemCount: result.items.length,
        lastItemHash: itemHash,
        scheduleNextSync: true,
      });
    }

    res.json(result);
  } catch (e) {
    logProductionError("portal-import", e, {
      profileUrl: profileUrl.slice(0, 120),
      portalKey,
      userId: req.authUserId,
    });
    res.status(422).json({ error: String(e) });
  }
});

/**
 * Background sync — cron batch (X-Cron-Secret) or single authed user portal refresh.
 * Cron runs full due queue; user POST syncs one profileUrl.
 */
spintaRouter.post("/sync", async (req: AuthedRequest, res) => {
  const cronSecret = process.env.SPINTA_SYNC_CRON_SECRET?.trim();
  const cronHeader = req.headers["x-cron-secret"];
  const isCron =
    Boolean(cronSecret) && typeof cronHeader === "string" && cronHeader === cronSecret;

  if (isCron && !req.body?.profileUrl) {
    try {
      const batch = await runPortalSyncBatch({ maxLinks: 8 });
      return res.json({
        ok: true,
        status: "batch_complete",
        triggeredBy: "cron",
        nextSyncInDays: 3,
        ...batch,
      });
    } catch (e) {
      logProductionError("portal-sync", e, { triggeredBy: "cron", mode: "batch" });
      return res.status(500).json({ error: String(e) });
    }
  }

  if (!isCron && !req.authUserId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const body = req.body as {
    profileUrl?: string;
    portalKey?: string;
    userName?: string;
    defaultLocation?: string;
    force?: boolean;
  };

  const profileUrl = body.profileUrl?.trim();
  if (!profileUrl) {
    return res.status(400).json({ error: "profileUrl is required" });
  }

  const portalKey = body.portalKey?.trim() || detectPortalKeyFromUrl(profileUrl);
  if (!portalKey) {
    return res.status(400).json({ error: "Unknown portal" });
  }

  const userId = req.authUserId!;
  try {
    const existing = await upsertPortalLink({
      userId,
      portalKey,
      portalLabel: portalLabelForKey(portalKey),
      profileUrl,
      status: "syncing",
      scheduleNextSync: false,
    });

    const outcome = await syncSinglePortalLink(existing, {
      force: body.force === true,
    });

    res.json({
      ok: outcome.status !== "error",
      status: outcome.status,
      triggeredBy: isCron ? "cron" : "user",
      userId,
      itemCount: outcome.itemCount,
      profileUrl,
      nextSyncInDays: 3,
    });
  } catch (e) {
    logProductionError("portal-sync", e, {
      userId,
      portalKey,
      profileUrl: profileUrl.slice(0, 120),
      triggeredBy: isCron ? "cron" : "user",
    });
    res.status(500).json({ error: String(e) });
  }
});
