import { Router } from "express";
import express from "express";
import { hasAgentAiKey } from "../load-env.js";
import { hasAiKey } from "../ai/llm-provider.js";
import { analyzeVisualSearchIntent } from "../ai/search-intent.js";
import { normalizeImageDataUrl } from "../ai/image-input.js";
import { parseMultipartImageRequest } from "../lib/multipart-image.js";
import { demoWalletTopUpAllowed } from "../demo-guards.js";
import { pool } from "../db.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { fetchListingsFeed } from "../controllers/listing-controller.js";
import {
  adminPatchListing,
  deleteListing,
  getAdminAgentContext,
  getBannedUserIds,
  getChats,
  getChatThreadMeta,
  getEscrowForThread,
  getEmbeddingIndexStats,
  getListings,
  getReportById,
  getReports,
  getReportsByReporter,
  getReviews,
  getSavedIds,
  getServiceLeadsForProvider,
  getUser,
  insertListing,
  insertReport,
  insertReview,
  insertServiceLead,
  insertUserRequirement,
  openServiceLeadWallet,
  promoteListingWallet,
  renewListing,
  setAdminAgentContext,
  setBannedUserIds,
  setSavedIds,
  topUpWallet,
  updateListing,
  updateReportStatus,
  upsertReport,
  upsertChat,
  upsertEscrow,
  upsertUser,
  upsertUserPushToken,
  setUserProfileType,
  updateUserAvatar,
  warnUser,
} from "../repository.js";
import { seedIfEmpty } from "../seed-runtime.js";
import {
  lookupVehicleOnServer,
  vehicleLookupFeatures,
} from "../vehicle/vehicle-lookup-route.js";
import { notifyListingMatch } from "../push/web-push.js";
import { scheduleWishlistMatchNotifications } from "../notifications/notifications-service.js";
import {
  notifyAdminsNewReport,
  notifyAdminsUserFollowUp,
  notifyReporterReply,
} from "../push/report-notify.js";
import { publishReportEvent, subscribeReportStream } from "../reports/report-bus.js";
import { enrichReportWithAi } from "../reports/enrich-report.js";
import {
  notifyNegotiationDealClosed,
  notifyNegotiationStarted,
} from "../services/push-service.js";
import { requireAdmin, requireAuth, userIsAdmin } from "../middleware/auth.js";
import type {
  ApiChatThread,
  ApiEscrowTransaction,
  ApiUser,
} from "../types.js";
import type { Response } from "express";
import type { ValidationResult } from "../validation.js";
import {
  validateAmount,
  validateChatThread,
  validateEscrow,
  validateIdArray,
  validateListing,
  validateListingPatch,
  validateReport,
  validateReportStatus,
  validateReview,
  validateServiceLeadCreate,
  validateUser,
  validateUserProfilePatch,
} from "../validation.js";
import {
  saveUserAvatarFromImage,
  saveUserProfile,
} from "../controllers/user-controller.js";
import { runVautoE2eSimulation } from "../test/vauto-e2e-simulation.js";
import { proxyImageHandler } from "../controllers/proxy-controller.js";
import { resolveAppVersionPayload } from "../lib/app-version-config.js";

export const apiRouter = Router();

function badRequest<T>(res: Response, result: ValidationResult<T>): result is { ok: false; error: string } {
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return true;
  }
  return false;
}

function actorId(req: AuthedRequest): string {
  return req.authUserId ?? String(req.headers["x-user-id"] ?? "");
}

function isAdmin(req: AuthedRequest): boolean {
  return req.authRole === "admin";
}

function requestedUserId(req: AuthedRequest): string {
  return String(req.headers["x-user-id"] ?? "");
}

function canActForUser(req: AuthedRequest, userId?: string): boolean {
  return Boolean(userId && (req.authUserId === userId || isAdmin(req)));
}

function canAccessThread(req: AuthedRequest, thread: ApiChatThread): boolean {
  return canActForUser(req, thread.buyerId) || canActForUser(req, thread.sellerId);
}

function canAccessEscrow(req: AuthedRequest, escrow: ApiEscrowTransaction): boolean {
  return canActForUser(req, escrow.buyerId) || canActForUser(req, escrow.sellerId);
}

function routeActorId(req: AuthedRequest): string {
  if (isAdmin(req) && requestedUserId(req)) return requestedUserId(req);
  return actorId(req);
}

async function serviceLeadsReady(): Promise<boolean> {
  try {
    await pool.query("SELECT 1 FROM service_leads LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

function computeReadiness(
  features: Record<string, boolean>,
  embeddings: { activeListings: number; textIndexed: number; imageIndexed: number } | undefined,
  serviceLeads: boolean
): { score: number; regitraMode: "live" | "demo"; embeddingsSynced: boolean } {
  const embeddingsSynced = Boolean(
    embeddings &&
      embeddings.activeListings > 0 &&
      embeddings.textIndexed >= embeddings.activeListings &&
      embeddings.imageIndexed >= embeddings.textIndexed
  );
  const checks = [
    features.jwt,
    features.gemini,
    features.stripe,
    features.stripeWebhook,
    features.vehicleLookup,
    serviceLeads,
    embeddingsSynced,
    features.regitraPlateApi || features.regitraDemo,
  ];
  return {
    score: Math.round((checks.filter(Boolean).length / checks.length) * 100),
    regitraMode: features.regitraPlateApi ? "live" : "demo",
    embeddingsSynced,
  };
}

apiRouter.get("/proxy/image", (req, res) => {
  void proxyImageHandler(req, res);
});

apiRouter.get("/version", (_req, res) => {
  res.json(resolveAppVersionPayload());
});

apiRouter.get("/health", async (_req, res) => {
  const vehicle = vehicleLookupFeatures();
  const features = {
    sms: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
    ),
    googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID),
    webPush: Boolean(
      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ),
    fcm: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    jwt: Boolean(process.env.JWT_SECRET),
    gemini: hasAiKey(),
    geminiAgent: hasAgentAiKey(),
    vautoUnified: hasAiKey(),
    reportEmail: Boolean(process.env.RESEND_API_KEY?.trim()),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    regitraPlateApi: vehicle.regitraPlateApi,
    regitraDemo: vehicle.regitraDemo,
    vehicleLookup: vehicle.nhtsaVin,
  };

  let embeddings: {
    activeListings: number;
    textIndexed: number;
    imageIndexed: number;
  } | undefined;
  let serviceLeads = false;

  try {
    await pool.query("SELECT 1");
    serviceLeads = await serviceLeadsReady();
    embeddings = await getEmbeddingIndexStats();
    const readiness = computeReadiness(
      { ...features, serviceLeads },
      embeddings,
      serviceLeads
    );
    res.json({
      ok: true,
      service: "vauto-api",
      db: "connected",
      features: { ...features, serviceLeads },
      embeddings,
      readiness,
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      service: "vauto-api",
      db: "unavailable",
      features,
      error: String(e),
    });
  }
});

/** Centralized buyer/seller session simulation for QA and production smoke checks. */
apiRouter.get("/test/e2e-simulation", async (_req, res) => {
  try {
    const result = await runVautoE2eSimulation();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/** Idempotent demo catalog upsert — safe to call after deploy without Render API key. */
apiRouter.post("/bootstrap", async (_req, res) => {
  try {
    await seedIfEmpty();
    const listings = await getListings();
    let backfill = { text: 0, image: 0 };
    if (hasAiKey()) {
      const { backfillListingEmbeddings } = await import(
        "../ai/listing-embedding.js"
      );
      const { backfillImageEmbeddings } = await import(
        "../ai/image-embedding.js"
      );
      backfill = {
        text: await backfillListingEmbeddings(50),
        image: await backfillImageEmbeddings(50),
      };
    }
    const embeddings = await getEmbeddingIndexStats();
    const leadCountRows = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM service_leads"
    );
    const serviceLeads = Number(leadCountRows.rows[0]?.count ?? 0);
    res.json({
      ok: true,
      listings: listings.length,
      serviceLeads,
      backfill,
      embeddings,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/admin/backfill-embeddings", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.body?.limit ?? 50), 1), 100);
    const { backfillListingEmbeddings } = await import(
      "../ai/listing-embedding.js"
    );
    const { backfillImageEmbeddings } = await import(
      "../ai/image-embedding.js"
    );
    const text = await backfillListingEmbeddings(limit);
    const image = await backfillImageEmbeddings(Math.ceil(limit / 2));
    const embeddings = await getEmbeddingIndexStats();
    res.json({ ok: true, text, image, embeddings });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/admin/setup-stripe", requireAdmin, async (_req, res) => {
  try {
    const { getStripe } = await import("../billing/stripe-client.js");
    if (!getStripe()) {
      return res.status(503).json({ error: "STRIPE_SECRET_KEY not set on server" });
    }
    const {
      ensureStripePortalConfiguration,
      ensureStripeWebhookEndpoint,
    } = await import("../billing/ensure-stripe.js");
    const portal = await ensureStripePortalConfiguration();
    const webhook = await ensureStripeWebhookEndpoint();
    res.json({
      ok: true,
      portal,
      webhook: {
        url: webhook.url,
        created: webhook.created,
        hasNewSecret: Boolean(webhook.secret),
        webhookSecret: webhook.secret ?? null,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/listings", async (req, res) => {
  try {
    const page = await fetchListingsFeed({
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    if (req.query.meta === "1") {
      res.json(page);
      return;
    }
    res.json(page.items);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/listings", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = validateListing(req.body);
    if (badRequest(res, parsed)) return;
    const listing = parsed.value;
    if (!canActForUser(req, listing.sellerId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await insertListing(listing);
    void notifyListingMatch(listing).catch(() => {});
    scheduleWishlistMatchNotifications(listing);
    res.status(201).json(listing);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.delete("/listings/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const sellerId = routeActorId(req);
    const ok = await deleteListing(req.params.id, sellerId);
    res.status(ok ? 204 : 404).end();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/listings/:id/renew", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const sellerId = routeActorId(req);
    const listing = await renewListing(req.params.id, sellerId);
    if (!listing) return res.status(404).json({ error: "Not found" });
    res.json(listing);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.patch("/listings/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = validateListingPatch(req.body);
    if (badRequest(res, parsed)) return;
    const sellerId = routeActorId(req);
    const listing = await updateListing(
      req.params.id,
      sellerId,
      parsed.value
    );
    if (!listing) return res.status(404).json({ error: "Not found" });
    res.json(listing);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/reports", requireAdmin, async (_req, res) => {
  try {
    res.json(await getReports());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/reports/mine", requireAuth, async (req: AuthedRequest, res) => {
  try {
    res.json(await getReportsByReporter(req.authUserId!));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/reports/stream", requireAuth, (req: AuthedRequest, res) => {
  subscribeReportStream(req.authUserId!, req.authRole ?? "private", res);
});

apiRouter.post("/reports", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = validateReport(req.body);
    if (badRequest(res, parsed)) return;
    const report = parsed.value;
    if (!canActForUser(req, report.reporterId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await insertReport(report);
    publishReportEvent("report_created", report);
    void notifyAdminsNewReport(report);
    void enrichReportWithAi(report).catch((e) =>
      console.warn("[vauto] report AI enrich failed", e)
    );
    res.status(201).json(report);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.patch("/reports/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const existing = await getReportById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const admin = await userIsAdmin(req);
    const isOwner = existing.reporterId === req.authUserId;
    if (!admin && !isOwner) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (req.body && typeof req.body === "object" && "id" in req.body) {
      const parsed = validateReport(req.body);
      if (badRequest(res, parsed)) return;
      if (parsed.value.id !== req.params.id) {
        res.status(400).json({ error: "Report id mismatch" });
        return;
      }
      if (!admin) {
        if (parsed.value.reporterId !== req.authUserId) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        const reporterUpdate = {
          ...existing,
          messages: parsed.value.messages,
          comment: parsed.value.comment,
          updatedAt: parsed.value.updatedAt ?? new Date().toISOString(),
          unreadByReporter: parsed.value.unreadByReporter,
          unreadByAdmin: parsed.value.unreadByAdmin ?? true,
        };
        await upsertReport(reporterUpdate);
        publishReportEvent("report_updated", reporterUpdate);
        if (reporterUpdate.unreadByAdmin) {
          void notifyAdminsUserFollowUp(reporterUpdate);
        }
        res.json(reporterUpdate);
        return;
      }
      await upsertReport(parsed.value);
      publishReportEvent("report_updated", parsed.value);
      if (parsed.value.unreadByReporter) {
        void notifyReporterReply(parsed.value);
      }
      res.json(parsed.value);
      return;
    }

    if (!admin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = validateReportStatus(req.body);
    if (badRequest(res, parsed)) return;
    const ok = await updateReportStatus(req.params.id, parsed.value);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/banned-users", requireAdmin, async (_req, res) => {
  try {
    res.json(await getBannedUserIds());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.put("/banned-users", requireAdmin, async (req, res) => {
  try {
    const parsed = validateIdArray(req.body);
    if (badRequest(res, parsed)) return;
    await setBannedUserIds(parsed.value);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.patch("/admin/listings/:id", requireAdmin, async (req, res) => {
  try {
    const parsed = validateListingPatch(req.body);
    if (badRequest(res, parsed)) return;
    const patch: Partial<{ banned: boolean; status: string }> = {};
    if (parsed.value.banned !== undefined) patch.banned = parsed.value.banned;
    if (parsed.value.status !== undefined) patch.status = parsed.value.status;
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Provide banned and/or status" });
      return;
    }
    const listing = await adminPatchListing(req.params.id, patch);
    if (!listing) return res.status(404).json({ error: "Not found" });
    res.json(listing);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/users/:id/warn", requireAdmin, async (req, res) => {
  try {
    await warnUser(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get(
  "/admin/agent-project-context",
  requireAdmin,
  async (req: AuthedRequest, res) => {
    try {
      const context = await getAdminAgentContext(req.authUserId!);
      res.json({ context });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

apiRouter.put(
  "/admin/agent-project-context",
  requireAdmin,
  async (req: AuthedRequest, res) => {
    try {
      const context =
        typeof req.body?.context === "string" ? req.body.context : "";
      const saved = await setAdminAgentContext(req.authUserId!, context);
      res.json({ ok: true, context: saved });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

apiRouter.put("/user/profile", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.authUserId!;
    const parsed = validateUserProfilePatch(req.body);
    if (badRequest(res, parsed)) return;
    const updated = await saveUserProfile(userId, parsed.value);
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/user/avatar", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.authUserId!;
    const imageDataUrl = String(req.body?.imageDataUrl ?? "").trim();
    if (!imageDataUrl) {
      res.status(400).json({ error: "imageDataUrl is required" });
      return;
    }
    const updated = await saveUserAvatarFromImage(userId, imageDataUrl);
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(updated);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message || String(e) });
  }
});

apiRouter.post("/user/profile-type", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const profileType = String(req.body?.profileType ?? "").trim();
    if (profileType !== "private" && profileType !== "business") {
      res.status(400).json({ error: "profileType must be private or business" });
      return;
    }
    const existing = await getUser(req.authUserId!);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (existing.profileType && existing.profileType !== profileType) {
      res.status(409).json({ error: "Profilio tipas jau nustatytas" });
      return;
    }
    const updated =
      existing.profileType === profileType
        ? existing
        : await setUserProfileType(req.authUserId!, profileType);
    if (!updated?.profileType) {
      res.status(500).json({ error: "Nepavyko išsaugoti profilio tipo" });
      return;
    }
    res.json({ user: updated, profileType: updated.profileType });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/user/push-token", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const token = String(req.body?.token ?? "").trim();
    const deviceType = String(
      req.body?.device_type ?? req.body?.platform ?? "android"
    ).trim();
    if (!token) {
      res.status(400).json({ error: "token required" });
      return;
    }
    await upsertUserPushToken(req.authUserId!, token, deviceType);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/users/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!canActForUser(req, req.params.id)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "Not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.put("/users/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!canActForUser(req, req.params.id)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = validateUser(req.body);
    if (badRequest(res, parsed)) return;
    const user: ApiUser = isAdmin(req)
      ? parsed.value
      : {
          ...parsed.value,
          role: req.authRole ?? parsed.value.role,
          warned: undefined,
          walletBalance: undefined,
          soldCount: undefined,
        };
    await upsertUser({ ...user, id: req.params.id });
    if (parsed.value.avatar) {
      await updateUserAvatar(req.params.id, parsed.value.avatar);
    }
    res.json({ ...user, id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.patch("/users/:id/avatar", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!canActForUser(req, req.params.id)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const avatar = String(req.body?.avatar ?? "").trim();
    if (!avatar || avatar.length > 120_000) {
      res.status(400).json({ error: "Invalid avatar URL" });
      return;
    }
    const updatedUser = await updateUserAvatar(req.params.id, avatar);
    if (!updatedUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(updatedUser);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/saved/:userId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!canActForUser(req, req.params.userId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(await getSavedIds(req.params.userId));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.put("/saved/:userId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!canActForUser(req, req.params.userId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = validateIdArray(req.body);
    if (badRequest(res, parsed)) return;
    await setSavedIds(req.params.userId, parsed.value);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/chats/:userId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!canActForUser(req, req.params.userId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(await getChats(req.params.userId));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.put("/chats", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = validateChatThread(req.body);
    if (badRequest(res, parsed)) return;
    const thread = parsed.value;
    if (!canAccessThread(req, thread)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const prev = await getChatThreadMeta(thread.id);
    const prevBuyerMsgs = prev?.buyerMessageCount ?? 0;
    const nextBuyerMsgs = thread.messages.filter(
      (m) => m.senderId === thread.buyerId
    ).length;
    const latestBuyerMsg = [...thread.messages]
      .reverse()
      .find((m) => m.senderId === thread.buyerId);

    await upsertChat(thread);
    res.json(thread);

    void (async () => {
      if (
        nextBuyerMsgs > prevBuyerMsgs &&
        latestBuyerMsg &&
        thread.sellerId
      ) {
        await notifyNegotiationStarted(thread.sellerId, {
          chatId: thread.id,
          listingTitle: thread.listingTitle,
          preview: latestBuyerMsg.text,
        });
      }

      if (thread.escrowOffered && prev && !prev.escrowOffered) {
        await notifyNegotiationDealClosed(
          [thread.buyerId, thread.sellerId],
          {
            chatId: thread.id,
            listingTitle: thread.listingTitle,
          }
        );
      }
    })();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get(
  "/escrow/thread/:threadId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const escrow = await getEscrowForThread(req.params.threadId);
      if (!escrow) return res.status(404).json({ error: "Not found" });
      if (!canAccessEscrow(req, escrow)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      res.json(escrow);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

apiRouter.put("/escrow", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = validateEscrow(req.body);
    if (badRequest(res, parsed)) return;
    const escrow = parsed.value;
    if (!canAccessEscrow(req, escrow)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await upsertEscrow(escrow);
    res.json(escrow);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/reviews", async (_req, res) => {
  try {
    res.json(await getReviews());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/reviews", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = validateReview(req.body);
    if (badRequest(res, parsed)) return;
    const review = parsed.value;
    if (review.reviewerId !== req.authUserId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await insertReview(review);
    res.status(201).json(review);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/wallet/top-up", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!demoWalletTopUpAllowed()) {
      res.status(503).json({
        error:
          "Demo piniginės papildymas išjungtas gamyboje. Naudokite Stripe kainodarą.",
      });
      return;
    }
    const amount = validateAmount(req.body, "amount", 1, 500);
    if (badRequest(res, amount)) return;
    const result = await topUpWallet(req.authUserId!, amount.value);
    if (!result) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }
    res.json({ ...result, mode: "demo" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post(
  "/listings/:id/promote",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const cost = validateAmount(req.body, "cost", 1, 500);
      if (badRequest(res, cost)) return;
      const tierRaw = req.body?.tier;
      const tier =
        typeof tierRaw === "number" && tierRaw >= 1 && tierRaw <= 5
          ? tierRaw
          : 2;
      const result = await promoteListingWallet(
        req.authUserId!,
        req.params.id,
        cost.value,
        tier
      );
      if (!result) {
        res.status(400).json({ error: "Insufficient balance or listing not found" });
        return;
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

apiRouter.post("/vehicle/lookup", async (req, res) => {
  try {
    const identifier = String(
      (req.body as { identifier?: string })?.identifier ?? ""
    ).trim();
    if (!identifier) {
      res.status(400).json({ error: "identifier is required" });
      return;
    }
    const result = await lookupVehicleOnServer(identifier);
    if (!result) {
      res.status(404).json({ error: "Vehicle not found" });
      return;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/service-leads", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const leads = await getServiceLeadsForProvider(req.authUserId!);
    res.json(leads);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/service-leads", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = validateServiceLeadCreate(req.body);
    if (badRequest(res, parsed)) return;
    const lead = await insertServiceLead(req.authUserId, parsed.value);
    if (!lead) {
      res.status(409).json({ error: "Duplicate lead within the last hour" });
      return;
    }
    res.status(201).json(lead);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post(
  "/service-leads/:id/open",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const cost = validateAmount(req.body, "cost", 0.5, 50);
      if (badRequest(res, cost)) return;
      const result = await openServiceLeadWallet(
        req.authUserId!,
        req.params.id,
        cost.value
      );
      if (!result) {
        res.status(400).json({ error: "Insufficient balance or lead not found" });
        return;
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

apiRouter.post("/requirements", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const queryText = String(body.query ?? "").trim();
    if (queryText.length < 3) {
      res.status(400).json({ error: "query must be at least 3 characters" });
      return;
    }
    const created = await insertUserRequirement(req.authUserId!, {
      query: queryText,
      category: body.category ? String(body.category) : undefined,
      city: body.city ? String(body.city) : undefined,
      maxPrice: body.maxPrice != null ? Number(body.maxPrice) : undefined,
      minPrice: body.minPrice != null ? Number(body.minPrice) : undefined,
      size: body.size ? String(body.size) : undefined,
      subcategory: body.subcategory ? String(body.subcategory) : undefined,
      wardrobeMode: Boolean(body.wardrobeMode),
      filters:
        body.filters && typeof body.filters === "object"
          ? (body.filters as Record<string, unknown>)
          : undefined,
      source: body.source ? String(body.source) : "client",
    });
    if (!created) {
      res.status(400).json({ error: "Could not create requirement" });
      return;
    }
    res.status(201).json({ ok: true, id: created.id, query: queryText });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const visionSearchBodyParser = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (req.is("multipart/form-data")) {
    express.raw({ type: "multipart/form-data", limit: "25mb" })(req, res, next);
    return;
  }
  if (req.body && typeof req.body === "object" && Object.keys(req.body as object).length > 0) {
    next();
    return;
  }
  express.json({ limit: "25mb" })(req, res, next);
};

/** Legacy photo search endpoint — maps Vision intent to keywords for older clients. */
apiRouter.post("/search/vision", visionSearchBodyParser, async (req, res) => {
  if (!hasAiKey()) {
    return res.status(503).json({ ok: false, error: "GEMINI_API_KEY not set" });
  }

  let imageBase64: string | undefined;
  let extraContext: string | undefined;
  let userCity = "Lietuva";

  const multipart = parseMultipartImageRequest(req);
  if (multipart) {
    imageBase64 = multipart.imageDataUrl;
    extraContext = multipart.fields.extraContext?.trim() || undefined;
    userCity = multipart.fields.userCity?.trim() || userCity;
  } else {
    const body = req.body as {
      imageBase64?: string;
      imageDataUrl?: string;
      extraContext?: string;
      userCity?: string;
    };
    imageBase64 = body.imageDataUrl ?? body.imageBase64;
    extraContext = body.extraContext?.trim() || undefined;
    userCity = body.userCity?.trim() || userCity;
  }

  if (!imageBase64?.trim()) {
    return res.status(400).json({ ok: false, error: "imageBase64 is required" });
  }

  const normalizedImage = normalizeImageDataUrl(imageBase64) ?? imageBase64.trim();

  try {
    const intent = await analyzeVisualSearchIntent({
      imageDataUrl: normalizedImage.startsWith("data:") ? normalizedImage : undefined,
      imageBase64: normalizedImage.startsWith("data:") ? undefined : normalizedImage,
      extraContext,
      userCity,
    });
    if (!intent.cleanQuery?.trim() || intent.confidence < 0.2) {
      const alt = intent.semanticAlternatives?.[0]?.trim();
      if (!alt) {
        return res.status(422).json({ ok: false, error: "Prekė neatpažinta" });
      }
    }
    res.json({
      ok: true,
      keywords: intent.cleanQuery || intent.semanticAlternatives?.[0] || "",
      confidence: intent.confidence,
      category: intent.listingCategory ?? intent.category ?? "other",
      title: intent.visualSummary || intent.cleanQuery,
      searchFilters: intent.searchFilters,
      location: intent.location,
      sceneContext: intent.sceneContext,
      detectedObjects: intent.detectedObjects,
      choiceChips: intent.choiceChips,
      semanticAlternatives: intent.semanticAlternatives,
      clarificationPrompt: intent.clarificationPrompt,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});
