/**
 * Stage 10 production API — Auth-gated, server-authoritative (Etapas 10K).
 */

import { Router } from "express";
import { z } from "zod";
import { classifyIntent } from "../ai/intent/index.js";
import { runNaturalLanguageSearch } from "../ai/search/index.js";
import { buildSellDraft, SELL_AUTO_PUBLISH } from "../ai/sell/index.js";
import { computeValuation } from "../market-intelligence/index.js";
import { computeVautoScore } from "../vauto-score/index.js";
import { runBuyerMatch } from "../buyer-match/index.js";
import { runCompareEngine } from "../compare-engine/index.js";
import {
  getAiWatchRepository,
  WatchThresholdsSchema,
} from "../ai-watch/index.js";
import { SearchQuerySchema } from "../ai/search/search-schema.js";
import { sendInternalError } from "../lib/http-errors.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import {
  loadSearchCatalog,
  loadCompareListingsByIds,
  loadMatchListingsByIds,
  apiListingToSearchRecord,
} from "../ai/stage10/catalog-adapters.js";
import {
  loadAuthoritativeListing,
  loadMarketObservationsForListing,
  listingToMarketSubject,
  listingToQualityInput,
  loadSellerTrustInput,
  loadDemandInputForListing,
  loadTransactionConfidence,
  rejectClientAuthoritativePayload,
} from "../ai/stage10/authoritative-loaders.js";
import {
  createProductionImageSafetyProvider,
  createProductionVisionExtractor,
} from "../ai/stage10/sell-providers.js";
import { getListingForEmbedding } from "../repository.js";

export const stage10Router = Router();

stage10Router.use(requireAuth);

stage10Router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stage: "10K",
    modules: [
      "intent",
      "search",
      "sell",
      "market",
      "score",
      "match",
      "compare",
      "watch",
    ],
    serverAuthoritative: true,
  });
});

/** 10A Intent */
stage10Router.post("/intent", async (req: AuthedRequest, res) => {
  try {
    const text = String(req.body?.text ?? "").slice(0, 4000);
    if (!text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }
    const result = await classifyIntent({
      text,
      requestId: req.body?.requestId,
      llmCaller: null,
    });
    res.json(result);
  } catch (e) {
    sendInternalError(res, e);
  }
});

/** 10B NL Search — catalog from real DB */
stage10Router.post("/search", async (req: AuthedRequest, res) => {
  try {
    const text = String(req.body?.text ?? "").slice(0, 4000);
    if (!text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }
    const limit = Math.min(Number(req.body?.limit) || 40, 100);
    const catalog = await loadSearchCatalog();
    const out = await runNaturalLanguageSearch({
      text,
      requestId: req.body?.requestId,
      catalog: { loadCandidates: async () => catalog },
      llmCaller: null,
      limit,
    });
    const { explanationPromise: _ep, ...body } = out;
    res.json(body);
  } catch (e) {
    sendInternalError(res, e);
  }
});

/** 10C Sell draft — real Vision + image safety; never auto-publishes */
stage10Router.post("/sell/draft", async (req: AuthedRequest, res) => {
  try {
    const body = req.body ?? {};
    const draft = await buildSellDraft({
      input: {
        imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : [],
        transcript: body.voiceTranscript ?? body.transcript,
        text: body.textNotes ?? body.text,
      },
      visionExtractor: createProductionVisionExtractor(),
      imageSafetyProvider: createProductionImageSafetyProvider(),
      requestId: body.requestId,
    });
    res.json({
      ...draft,
      ownerUserId: req.authUserId,
      autoPublish: SELL_AUTO_PUBLISH,
    });
  } catch (e) {
    sendInternalError(res, e);
  }
});

const ListingIdBody = z
  .object({
    listingId: z.string().min(1).max(128).optional(),
    draftId: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine((b) => Boolean(b.listingId || b.draftId), {
    message: "listingId or draftId required",
  });

/** 10D Market Intelligence — server-authoritative (listingId only) */
stage10Router.post("/market/valuation", async (req: AuthedRequest, res) => {
  try {
    const injected = rejectClientAuthoritativePayload(req.body);
    if (injected) {
      return res.status(400).json({
        error: "server_authoritative_only",
        detail: injected,
      });
    }
    const parsed = ListingIdBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "listingId (or draftId) required" });
    }
    const listingId = parsed.data.listingId ?? parsed.data.draftId!;
    const access = await loadAuthoritativeListing(listingId, req.authUserId!);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }
    const subject = listingToMarketSubject(access.listing);
    const observations = await loadMarketObservationsForListing(access.listing);
    const result = computeValuation({
      subject,
      observations,
      now: new Date(),
    });
    res.json({
      ...result,
      listingId: access.listing.id,
      source: "server_db",
    });
  } catch (e) {
    sendInternalError(res, e);
  }
});

/** 10E VAUTO Score — server-authoritative (listingId only) */
stage10Router.post("/score", async (req: AuthedRequest, res) => {
  try {
    const injected = rejectClientAuthoritativePayload(req.body);
    if (injected) {
      return res.status(400).json({
        error: "server_authoritative_only",
        detail: injected,
      });
    }
    const parsed = ListingIdBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "listingId (or draftId) required" });
    }
    const listingId = parsed.data.listingId ?? parsed.data.draftId!;
    const access = await loadAuthoritativeListing(listingId, req.authUserId!);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }
    const listing = access.listing;
    const subject = listingToMarketSubject(listing);
    const observations = await loadMarketObservationsForListing(listing);
    const marketValuation = computeValuation({
      subject,
      observations,
      now: new Date(),
    });
    const [seller, demand, transaction] = await Promise.all([
      loadSellerTrustInput(listing.sellerId),
      loadDemandInputForListing(listing),
      loadTransactionConfidence(listing),
    ]);
    const result = computeVautoScore({
      askingPrice: Number(listing.price),
      marketValuation,
      listing: listingToQualityInput(listing),
      seller,
      demand,
      transaction,
      calculatedAt: new Date().toISOString(),
    });
    res.json({
      ...result,
      listingId: listing.id,
      source: "server_db",
    });
  } catch (e) {
    sendInternalError(res, e);
  }
});

/** 10F Buyer Match — candidates loaded from DB by id */
stage10Router.post("/match", async (req: AuthedRequest, res) => {
  try {
    const request = req.body?.request ?? req.body;
    const ids: string[] = Array.isArray(request?.candidateListingIds)
      ? request.candidateListingIds.map(String)
      : [];
    if (!ids.length) {
      return res.status(400).json({ error: "candidateListingIds required" });
    }
    const listings = await loadMatchListingsByIds(ids);
    const result = runBuyerMatch({
      request,
      listings,
      calculatedAt: new Date().toISOString(),
    });
    res.json(result);
  } catch (e) {
    sendInternalError(res, e);
  }
});

/** 10G Compare — 2–4 real listing IDs */
stage10Router.post("/compare", async (req: AuthedRequest, res) => {
  try {
    const parsed = z
      .object({
        listingIds: z.array(z.string().min(1)).min(2).max(4),
        buyerContext: z.unknown().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "listingIds (2–4) required" });
    }
    const result = await runCompareEngine({
      request: {
        listingIds: parsed.data.listingIds,
        requestUserId: req.authUserId,
        buyerContext: parsed.data.buyerContext as never,
      },
      catalog: {
        loadByIds: (ids) => loadCompareListingsByIds(ids, req.authUserId!),
      },
    });
    res.json(result);
  } catch (e) {
    sendInternalError(res, e);
  }
});

/** 10H AI Watch CRUD — ownership via authUserId */
const CreateWatchBody = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["SEARCH_WATCH", "LISTING_PRICE_WATCH"]),
  structuredQuery: SearchQuerySchema,
  thresholds: WatchThresholdsSchema.optional(),
  targetListingId: z.string().min(1).max(128).optional(),
});

stage10Router.post("/watch", async (req: AuthedRequest, res) => {
  try {
    const parsed = CreateWatchBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid watch payload" });
    }
    const repo = getAiWatchRepository();
    const rule = await repo.create({
      userId: req.authUserId!,
      ...parsed.data,
    });
    res.status(201).json(rule);
  } catch (e) {
    sendInternalError(res, e);
  }
});

stage10Router.get("/watch", async (req: AuthedRequest, res) => {
  try {
    const repo = getAiWatchRepository();
    res.json(await repo.listForUser(req.authUserId!));
  } catch (e) {
    sendInternalError(res, e);
  }
});

stage10Router.get("/watch/:id", async (req: AuthedRequest, res) => {
  try {
    const repo = getAiWatchRepository();
    const rule = await repo.getForUser(req.params.id, req.authUserId!);
    if (!rule) return res.status(404).json({ error: "Not found" });
    res.json(rule);
  } catch (e) {
    sendInternalError(res, e);
  }
});

stage10Router.patch("/watch/:id", async (req: AuthedRequest, res) => {
  try {
    const repo = getAiWatchRepository();
    const patch: Record<string, unknown> = {};
    if (typeof req.body?.name === "string") patch.name = req.body.name;
    if (typeof req.body?.status === "string") patch.status = req.body.status;
    if (req.body?.thresholds) patch.thresholds = req.body.thresholds;
    if (req.body?.structuredQuery) patch.structuredQuery = req.body.structuredQuery;
    const rule = await repo.updateRule(
      req.params.id,
      req.authUserId!,
      patch as never
    );
    if (!rule) return res.status(404).json({ error: "Not found" });
    res.json(rule);
  } catch (e) {
    sendInternalError(res, e);
  }
});

stage10Router.delete("/watch/:id", async (req: AuthedRequest, res) => {
  try {
    const repo = getAiWatchRepository();
    const ok = await repo.softDelete(req.params.id, req.authUserId!);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch (e) {
    sendInternalError(res, e);
  }
});

stage10Router.get("/watch-notifications", async (req: AuthedRequest, res) => {
  try {
    const repo = getAiWatchRepository();
    res.json(await repo.listNotificationsForUser(req.authUserId!));
  } catch (e) {
    sendInternalError(res, e);
  }
});

stage10Router.get("/catalog/:id", async (req: AuthedRequest, res) => {
  try {
    const listing = await getListingForEmbedding(req.params.id);
    if (!listing) return res.status(404).json({ error: "Not found" });
    if (
      listing.sellerId !== req.authUserId &&
      (listing.banned || listing.requiresReview || listing.status === "hidden")
    ) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(apiListingToSearchRecord(listing));
  } catch (e) {
    sendInternalError(res, e);
  }
});
