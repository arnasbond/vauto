import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  deleteListing,
  getBannedUserIds,
  getChats,
  getEscrowForThread,
  getListings,
  getReports,
  getSavedIds,
  getUser,
  insertListing,
  insertReport,
  renewListing,
  setBannedUserIds,
  setSavedIds,
  updateListing,
  updateReportStatus,
  upsertChat,
  upsertEscrow,
  upsertUser,
  warnUser,
} from "../repository.js";
import { seedIfEmpty } from "../seed-runtime.js";
import type {
  ApiChatThread,
  ApiEscrowTransaction,
  ApiListing,
  ApiSupportReport,
  ApiUser,
} from "../types.js";

export const apiRouter = Router();

function actorId(req: AuthedRequest): string {
  return req.authUserId ?? String(req.headers["x-user-id"] ?? "");
}

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vauto-api" });
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

apiRouter.post("/listings", async (req, res) => {
  try {
    const listing = req.body as ApiListing;
    await insertListing(listing);
    res.status(201).json(listing);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.delete("/listings/:id", async (req, res) => {
  try {
    const sellerId = actorId(req as AuthedRequest);
    const ok = await deleteListing(req.params.id, sellerId);
    res.status(ok ? 204 : 404).end();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/listings/:id/renew", async (req, res) => {
  try {
    const sellerId = actorId(req as AuthedRequest);
    const listing = await renewListing(req.params.id, sellerId);
    if (!listing) return res.status(404).json({ error: "Not found" });
    res.json(listing);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.patch("/listings/:id", async (req, res) => {
  try {
    const sellerId = actorId(req as AuthedRequest);
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

apiRouter.get("/reports", async (_req, res) => {
  try {
    res.json(await getReports());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/reports", async (req, res) => {
  try {
    const report = req.body as ApiSupportReport;
    await insertReport(report);
    res.status(201).json(report);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.patch("/reports/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    const ok = await updateReportStatus(req.params.id, status);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/banned-users", async (_req, res) => {
  try {
    res.json(await getBannedUserIds());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.put("/banned-users", async (req, res) => {
  try {
    const ids = req.body.ids as string[];
    await setBannedUserIds(ids);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.post("/users/:id/warn", async (req, res) => {
  try {
    await warnUser(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/users/:id", async (req, res) => {
  try {
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "Not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.put("/users/:id", async (req, res) => {
  try {
    const authed = req as AuthedRequest;
    if (authed.authUserId && authed.authUserId !== req.params.id) {
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

apiRouter.get("/saved/:userId", async (req, res) => {
  try {
    res.json(await getSavedIds(req.params.userId));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.put("/saved/:userId", async (req, res) => {
  try {
    const ids = req.body.ids as string[];
    await setSavedIds(req.params.userId, ids);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/chats/:userId", async (req, res) => {
  try {
    res.json(await getChats(req.params.userId));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.put("/chats", async (req, res) => {
  try {
    const thread = req.body as ApiChatThread;
    await upsertChat(thread);
    res.json(thread);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/escrow/thread/:threadId", async (req, res) => {
  try {
    const escrow = await getEscrowForThread(req.params.threadId);
    if (!escrow) return res.status(404).json({ error: "Not found" });
    res.json(escrow);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.put("/escrow", async (req, res) => {
  try {
    const escrow = req.body as ApiEscrowTransaction;
    await upsertEscrow(escrow);
    res.json(escrow);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
