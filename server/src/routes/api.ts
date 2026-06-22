import { Router } from "express";
import { pool } from "../db.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  deleteListing,
  getBannedUserIds,
  getChats,
  getEscrowForThread,
  getListings,
  getReports,
  getReviews,
  getSavedIds,
  getUser,
  insertListing,
  insertReport,
  insertReview,
  promoteListingWallet,
  renewListing,
  setBannedUserIds,
  setSavedIds,
  topUpWallet,
  updateListing,
  updateReportStatus,
  upsertChat,
  upsertEscrow,
  upsertUser,
  warnUser,
} from "../repository.js";
import { seedIfEmpty } from "../seed-runtime.js";
import { notifyListingMatch } from "../push/web-push.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import type {
  ApiChatThread,
  ApiEscrowTransaction,
  ApiListing,
  ApiReview,
  ApiSupportReport,
  ApiUser,
} from "../types.js";

export const apiRouter = Router();

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

apiRouter.get("/health", async (_req, res) => {
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
  };

  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      service: "vauto-api",
      db: "connected",
      features,
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
    res.json({ ok: true, listings: listings.length });
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
    const listing = req.body as ApiListing;
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
    const sellerId = routeActorId(req);
    const listing = await updateListing(
      req.params.id,
      sellerId,
      req.body as Partial<ApiListing>
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

apiRouter.post("/reports", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const report = req.body as ApiSupportReport;
    if (!canActForUser(req, report.reporterId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await insertReport(report);
    res.status(201).json(report);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.patch("/reports/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    const ok = await updateReportStatus(req.params.id, status);
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
    const ids = req.body.ids as string[];
    await setBannedUserIds(ids);
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
    const user = req.body as ApiUser;
    await upsertUser({ ...user, id: req.params.id });
    res.json(user);
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
    const ids = req.body.ids as string[];
    await setSavedIds(req.params.userId, ids);
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
    const thread = req.body as ApiChatThread;
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
    const escrow = req.body as ApiEscrowTransaction;
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
    const review = req.body as ApiReview;
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
    const amount = Number(req.body?.amount ?? 0);
    const result = await topUpWallet(req.authUserId!, amount);
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
      const cost = Number(req.body?.cost ?? 5);
      const result = await promoteListingWallet(
        req.authUserId!,
        req.params.id,
        cost
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
