import { Router } from "express";
import { handleFacetListingSearch } from "../marketplace/facet-http.js";

export const searchRouter = Router();

/** Lightweight search service probe — strict GET rate limit applies. */
searchRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vauto-search", tier: "ai" });
});

searchRouter.get("/listings", (req, res, next) => {
  void handleFacetListingSearch(req, res).catch(next);
});
