import { Router } from "express";
import {
  deleteListing,
  getChats,
  getEscrowForThread,
  getListings,
  getSavedIds,
  getUser,
  insertListing,
  setSavedIds,
  upsertChat,
  upsertEscrow,
  upsertUser,
} from "../repository.js";
import type { ApiChatThread, ApiEscrowTransaction, ApiListing, ApiUser } from "../types.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vauto-api" });
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
    const sellerId = String(req.headers["x-user-id"] ?? "");
    const ok = await deleteListing(req.params.id, sellerId);
    res.status(ok ? 204 : 404).end();
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
