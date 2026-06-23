import { Router } from "express";
import { hasAiKey } from "../ai/llm-provider.js";
import { pool } from "../db.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  deleteListing,
  getBannedUserIds,
  getChats,
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
  openServiceLeadWallet,
  promoteListingWallet,
  renewListing,
  setBannedUserIds,
  setSavedIds,
  topUpWallet,
  updateListing,
  updateReportStatus,
  upsertReport,
  upsertChat,
  upsertEscrow,
  upsertUser,
  warnUser,
} from "../repository.js";
import { seedIfEmpty } from "../seed-runtime.js";
import {
  lookupVehicleOnServer,
  vehicleLookupFeatures,
} from "../vehicle/vehicle-lookup-route.js";
import { notifyListingMatch } from "../push/web-push.js";
import {
  notifyAdminsNewReport,
  notifyAdminsUserFollowUp,
  notifyReporterReply,
} from "../push/report-notify.js";
import { publishReportEvent, subscribeReportStream } from "../reports/report-bus.js";
import { enrichReportWithAi } from "../reports/enrich-report.js";
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
} from "../validation.js";

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
    features.openai,
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
    openai: hasAiKey(),
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

apiRouter.get("/listings", async (_req, res) => {
  try {
    res.json(await getListings());
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

apiRouter.post("/users/:id/warn", requireAdmin, async (req, res) => {
  try {
    await warnUser(req.params.id);
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
    res.json({ ...user, id: req.params.id });
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
    await upsertChat(thread);
    res.json(thread);
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
    const amount = validateAmount(req.body, "amount", 1, 500);
    if (badRequest(res, amount)) return;
    const result = await topUpWallet(req.authUserId!, amount.value);
    if (!result) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }
    res.json(result);
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
