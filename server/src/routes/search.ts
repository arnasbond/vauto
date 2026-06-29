import { Router } from "express";

export const searchRouter = Router();

/** Lightweight search service probe — strict GET rate limit applies. */
searchRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vauto-search", tier: "ai" });
});
