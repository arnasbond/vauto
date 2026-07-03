import express, { Router } from "express";
import {
  chatJson,
  hasAiKey,
  resolveAiProvider,
  visionExtractJson,
} from "../ai/llm-provider.js";
import {
  analyzeSearchIntent,
  analyzeVisualSearchIntent,
} from "../ai/search-intent.js";
import { generateBuyerPersonaDescriptions } from "../ai/description-personas.js";
import { analyzeChatShield, refineChatShieldReply } from "../ai/chat-shield.js";
import { analyzeWardrobePhoto } from "../ai/wardrobe-vision.js";
import {
  activateExpressEscrow24h,
  buildExpressSellerNotification,
  confirmTransaction,
  confirmDeliveryForEscrow,
  shouldAutoConfirmExpress,
} from "../ai/order-agent.js";
import { importWardrobeProfile } from "../ai/wardrobe-profile-importer.js";
import { analyzeMagicMirrorFit } from "../ai/magic-mirror.js";
import { runAutoNegotiation } from "../ai/bargain-twin.js";
import { calculateAppraisal } from "../ai/price-appraisal.js";
import { generateListingShareCopy } from "../ai/listing-share-generator.js";
import { getListings, getUser } from "../repository.js";
import { toAgentListingSummary } from "../demo-catalog-api.js";
import { parseMultipartImageRequest } from "../lib/multipart-image.js";
import { normalizeImageInputList } from "../ai/image-input.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  buildUserContextInjectionBlock,
  resolveAuthenticatedAgentContext,
} from "../ai/user-agent-context.js";
import {
  resolveNegotiationProfileType,
} from "../services/ai-negotiator.js";
import { logProductionError } from "../lib/production-log.js";
import {
  imagesAfterPipeline,
  mergePipelineIntoListingFields,
  runVisualPipelineForExtract,
  visualPipelineFeatures,
  visualPipelineResponseSlice,
} from "../services/visual-pipeline.js";
import { VOICE_SECRETARY_PERSONA } from "../ai/secretary-persona.js";
import {
  isTooShortSecretaryQuery,
  normalizeSecretaryQuery,
  resolveSecretaryNoiseReply,
} from "../ai/secretary-guards.js";

export const aiRouter = Router();

const AI_UNAVAILABLE = { error: "GEMINI_API_KEY not set" };

aiRouter.get("/health", (_req, res) => {
  const provider = resolveAiProvider();
  res.json({
    ok: true,
    gemini: provider !== null,
    provider,
    mode: provider ?? "demo",
    visualPipeline: visualPipelineFeatures(),
  });
});

aiRouter.post("/visual-pipeline", async (req, res) => {
  const { imageDataUrl, imageDataUrls, category, listingTitle } = req.body as {
    imageDataUrl?: string;
    imageDataUrls?: string[];
    category?: string;
    listingTitle?: string;
  };
  const images = normalizeImageInputList(
    Array.isArray(imageDataUrls) && imageDataUrls.length
      ? imageDataUrls
      : imageDataUrl
        ? [imageDataUrl]
        : []
  );
  if (!images.length) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }
  try {
    const pipeline = await runVisualPipelineForExtract(images, {
      category,
      listingTitle,
    });
    res.json({ ok: true, ...visualPipelineResponseSlice(pipeline) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/photo-intent", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { imageDataUrl, imageDataUrls, extraContext, userCity, userName, wardrobeOnly } =
    req.body as {
      imageDataUrl?: string;
      imageDataUrls?: string[];
      extraContext?: string;
      userCity?: string;
      userName?: string;
      wardrobeOnly?: boolean;
    };

  const images = normalizeImageInputList(
    Array.isArray(imageDataUrls) && imageDataUrls.length
      ? imageDataUrls
      : imageDataUrl
        ? [imageDataUrl]
        : []
  );

  if (!images.length) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  try {
    const pipeline = await runVisualPipelineForExtract(images, {
      listingTitle: extraContext?.trim(),
    });
    const visionImages = imagesAfterPipeline(pipeline, images);

    const intent = await analyzeVisualSearchIntent({
      imageDataUrl: visionImages[0],
      imageDataUrls: visionImages.length > 1 ? visionImages : undefined,
      extraContext,
      userCity,
      userName,
      wardrobeOnly: Boolean(wardrobeOnly),
    });

    const objectLabel = intent.cleanQuery || intent.visualSummary || "objektą";
    const category = intent.listingCategory ?? "other";
    const choiceChips = intent.choiceChips ?? [];
    const phase = choiceChips.length >= 2 ? "multi_object" : "intent_resolution";

    res.json({
      ok: true,
      phase,
      objectLabel,
      category,
      confidence: intent.confidence,
      orderedImageUrls: visionImages,
      visualPipeline: visualPipelineResponseSlice(pipeline),
      visionIntent: intent,
      choiceChips: choiceChips.length ? choiceChips : undefined,
      clarificationPrompt: intent.clarificationPrompt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

const EXTRACTION_SCHEMA = `{
  "title": "string",
  "price": "number",
  "location": "string",
  "description": "string",
  "category": "vehicles | clothing | services | real_estate | electronics | home | other",
  "confidence": "number 0-1",
  "attributes": "object with category-specific fields, e.g. auto parts: partType, size, condition, quantity, marketHint"
}`;

function parseAttributes(raw: unknown): Record<string, string | string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) out[k] = v.map(String);
    else out[k] = String(v);
  }
  return out;
}

function toListing(raw: Record<string, unknown>, userCity: string, contact: string) {
  return {
    title: String(raw.title ?? "Skelbimas"),
    price: Number(raw.price) || 0,
    location: String(raw.location ?? userCity),
    contact,
    category: String(raw.category ?? "other"),
    description: raw.description ? String(raw.description) : undefined,
    confidence: Number(raw.confidence) || 0.8,
    attributes: parseAttributes(raw.attributes),
  };
}

const VEHICLE_VISION_RULES = `Jei nuotraukoje matomas visas automobilis (Citroën, Peugeot, BMW, VW ir kt.) — category "vehicles", title su make+model, attributes: make, model, year (jei matoma), fuelType, mileage (jei matoma), bodyType.
Jei auto dalis (ratlankis, padanga) — category "vehicles" su partType, size, condition, quantity.
Jei mobilus telefonas — category "electronics", ne vehicles.`;

aiRouter.post("/extract-image", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { imageDataUrl, imageDataUrls, extraContext, userCity, contact } = req.body as {
    imageDataUrl?: string;
    imageDataUrls?: string[];
    extraContext?: string;
    userCity?: string;
    contact?: string;
  };
  const city = userCity || "Lietuva";
  const phone = contact || "+370 612 34567";
  const images = normalizeImageInputList(
    Array.isArray(imageDataUrls) && imageDataUrls.length
      ? imageDataUrls
      : imageDataUrl
        ? [imageDataUrl]
        : []
  );

  if (!images.length) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  const imageCountNote =
    images.length > 1
      ? ` Vartotojas įkėlė ${images.length} nuotraukas — naudok visas analizei.`
      : "";
  const contextNote = extraContext?.trim()
    ? ` Papildoma informacija (ko nematyti nuotraukose): ${extraContext.trim()}`
    : "";

  try {
    const pipeline = await runVisualPipelineForExtract(images, {
      listingTitle: extraContext?.trim(),
    });
    const visionImages = imagesAfterPipeline(pipeline, images);
    const raw = await visionExtractJson(
      `Ištrauk skelbimo duomenis iš nuotraukos taip, kad vartotojas galėtų iškart rasti panašią prekę arba publikuoti skelbimą. ${VEHICLE_VISION_RULES} Atpažink tiksliai pagrindinį objektą — category ir title turi atitikti tai, ką realiai matai. Kaina EUR.${imageCountNote}${contextNote} JSON: ${EXTRACTION_SCHEMA}. Miestas: ${city}`,
      visionImages
    );
    const listing = toListing(raw, city, phone);
    mergePipelineIntoListingFields(listing, pipeline);
    res.json({
      ...listing,
      visualPipeline: visualPipelineResponseSlice(pipeline),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /invalid image|required|decode/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

const VOICE_INTENT_SCHEMA = `{
  "understoodSummary": "string",
  "needsClarification": "boolean",
  "followUpQuestion": "string | null",
  "missingFields": ["string"],
  "imageSearchQuery": "string",
  "mergedTranscript": "string",
  "category": "electronics | vehicles | services | home | clothing | real_estate | other",
  "confidence": "number 0-1"
}`;

const REFERENCE_FALLBACK: Record<string, string[]> = {
  electronics: [
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop",
  ],
  vehicles: [
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop",
  ],
  other: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop",
  ],
};

aiRouter.post("/analyze-voice", async (req: AuthedRequest, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { transcript, mode, history, userCity, userName, accountType, myListingsSummary, isAuthenticated } =
    req.body as {
    transcript: string;
    mode?: "search" | "listing";
    history?: { role: "user" | "assistant"; text: string }[];
    userCity?: string;
    userName?: string;
    accountType?: string;
    myListingsSummary?: string;
    isAuthenticated?: boolean;
  };

  if (!transcript?.trim()) {
    return res.status(400).json({ error: "transcript is required" });
  }

  const cleanedTranscript = normalizeSecretaryQuery(transcript);
  if (isTooShortSecretaryQuery(cleanedTranscript)) {
    const followUp = resolveSecretaryNoiseReply(cleanedTranscript, "voice");
    return res.json({
      understoodSummary: followUp,
      needsClarification: true,
      followUpQuestion: followUp,
      missingFields: [],
      imageSearchQuery: "",
      mergedTranscript: cleanedTranscript,
      category: "other",
      confidence: 0.15,
    });
  }

  const userCtx = await resolveAuthenticatedAgentContext(req.authUserId, {
    userName,
    accountType,
    userCity,
    isAuthenticated,
    myListingsSummary,
  });
  const userProfileBlock = buildUserContextInjectionBlock(userCtx);

  const historyText = (history ?? [])
    .map((h) => `${h.role === "user" ? "Vartotojas" : "AI"}: ${h.text}`)
    .join("\n");
  const modeHint =
    mode === "listing"
      ? "Vartotojas nori įdėti / parduoti skelbimą — NE paieška."
      : "Nustatyk ar vartotojas IEŠKO prekės, ar nori KELTI skelbimą. Jei kelia skelbimą — needsClarification tik dėl trūkstamų laukų, ne imageSearchQuery.";

  try {
    const raw = await chatJson([
      {
        role: "system",
        content: `${VOICE_SECRETARY_PERSONA}

${userProfileBlock}

Esi VAUTO balso sekretorius Lietuvoje (tik Gemini). ${modeHint}
understoodSummary — lietuviškai, suasmenintai vardu, BE žodžių „ieškoti“ jei vartotojas kelia skelbimą.
imageSearchQuery — tik kai vartotojas IEŠKO, angliški raktažodžiai.
Jei vartotojas sako „pardaviau“ / „jau parduota“ — needsClarification=false, understoodSummary patvirtina archyvavimą (klientas vėliau kvies agentą).
Jei vartotojas kelia skelbimą (sell/listing) ir trūksta laukų — needsClarification=true ir followUpQuestion vienu šiltu TTS klausimu.`,
      },
      {
        role: "user",
        content: `Istorija:\n${historyText || "(tuščia)"}\n\nĮrašas: "${cleanedTranscript}"\nJSON: ${VOICE_INTENT_SCHEMA}\nMiestas: ${userCtx.userCity}`,
      },
    ]);
    res.json({
      understoodSummary: String(raw.understoodSummary ?? "Supratau"),
      needsClarification: Boolean(raw.needsClarification),
      followUpQuestion: raw.followUpQuestion ? String(raw.followUpQuestion) : null,
      missingFields: Array.isArray(raw.missingFields) ? raw.missingFields.map(String) : [],
      imageSearchQuery: String(raw.imageSearchQuery ?? transcript).slice(0, 80),
      mergedTranscript: String(raw.mergedTranscript ?? transcript),
      category: String(raw.category ?? "other"),
      confidence: Number(raw.confidence) || 0.75,
    });
  } catch {
    res.json({
      understoodSummary: "Ne viską aiškiai supratau",
      needsClarification: true,
      followUpQuestion:
        "Atsiprašau, ne viską aiškiai išgirdau. Ar galėtumėte pakartoti komandą?",
      missingFields: [],
      imageSearchQuery: "",
      mergedTranscript: String(transcript ?? ""),
      category: "other",
      confidence: 0.2,
    });
  }
});

aiRouter.post("/analyze-search", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { query, userCity, wardrobeOnly } = req.body as {
    query?: string;
    userCity?: string;
    wardrobeOnly?: boolean;
  };

  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const result = await analyzeSearchIntent({
      query: query.trim(),
      userCity,
      wardrobeOnly: Boolean(wardrobeOnly),
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const visualSearchBodyParser = (
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

async function handleVisualSearchIntent(
  req: express.Request,
  res: express.Response
) {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  let imageDataUrl: string | undefined;
  let imageDataUrls: string[] | undefined;
  let imageBase64: string | undefined;
  let userCity = "Lietuva";
  let userName: string | undefined;
  let extraContext: string | undefined;
  let wardrobeOnly = false;

  const multipart = parseMultipartImageRequest(req);
  if (multipart) {
    imageDataUrl = multipart.imageDataUrl;
    userCity = multipart.fields.userCity?.trim() || userCity;
    userName = multipart.fields.userName?.trim() || undefined;
    extraContext = multipart.fields.extraContext?.trim() || undefined;
    wardrobeOnly = multipart.fields.wardrobeOnly === "true";
  } else {
    const body = req.body as {
      imageDataUrl?: string;
      imageDataUrls?: string[];
      imageBase64?: string;
      userCity?: string;
      userName?: string;
      extraContext?: string;
      wardrobeOnly?: boolean;
    };
    imageDataUrl = body.imageDataUrl;
    imageDataUrls = body.imageDataUrls;
    imageBase64 = body.imageBase64;
    userCity = body.userCity?.trim() || userCity;
    userName = body.userName?.trim() || undefined;
    extraContext = body.extraContext?.trim() || undefined;
    wardrobeOnly = Boolean(body.wardrobeOnly);
  }

  if (!imageDataUrl && !imageDataUrls?.length && !imageBase64) {
    return res.status(400).json({ error: "imageDataUrl, imageBase64, or multipart image is required" });
  }

  try {
    const intent = await analyzeVisualSearchIntent({
      imageDataUrl,
      imageDataUrls,
      imageBase64,
      userCity,
      userName,
      extraContext,
      wardrobeOnly,
    });
    res.json(intent);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

aiRouter.post("/analyze-search-visual", visualSearchBodyParser, handleVisualSearchIntent);

aiRouter.post("/analyze-wardrobe-photo", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const body = req.body as { imageDataUrl?: string; userName?: string };
  if (!body.imageDataUrl?.trim()) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  try {
    const result = await analyzeWardrobePhoto({
      imageDataUrl: body.imageDataUrl.trim(),
      userName: body.userName,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/express-escrow-locker", async (req, res) => {
  const body = req.body as {
    escrow?: Record<string, unknown>;
    courierProvider?: string;
    sellerName?: string;
    listingTitle?: string;
  };
  if (!body.escrow || typeof body.escrow !== "object") {
    return res.status(400).json({ error: "escrow is required" });
  }

  const base = body.escrow as unknown as import("../types.js").ApiEscrowTransaction;
  const activated = activateExpressEscrow24h(base, body.courierProvider);
  const sellerNotification = buildExpressSellerNotification(
    body.sellerName?.trim() || "Pardavėjas",
    body.listingTitle?.trim() || "Prekė"
  );
  res.json({ escrow: activated, sellerNotification });
});

aiRouter.post("/process-express-escrow", async (req, res) => {
  try {
    const body = req.body as { escrow?: Record<string, unknown> };
    if (!body.escrow || typeof body.escrow !== "object") {
      return res.status(400).json({ error: "escrow is required" });
    }
    const escrow = body.escrow as unknown as import("../types.js").ApiEscrowTransaction & {
      expressEscrow24h?: boolean;
      claimDeadlineAt?: string;
    };
    if (!shouldAutoConfirmExpress(escrow)) {
      return res.json({ autoConfirmed: false, escrow });
    }
    const confirmed = await confirmDeliveryForEscrow(escrow.id);
    res.json({
      autoConfirmed: true,
      escrow: confirmed ?? confirmTransaction(escrow),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/import-wardrobe-profile", async (req, res) => {
  const body = req.body as {
    profileUrl?: string;
    userName?: string;
    defaultLocation?: string;
  };
  if (!body.profileUrl?.trim()) {
    return res.status(400).json({ error: "profileUrl is required" });
  }
  try {
    const result = await importWardrobeProfile({
      profileUrl: body.profileUrl.trim(),
      userName: body.userName,
      defaultLocation: body.defaultLocation,
    });
    res.json(result);
  } catch (e) {
    res.status(422).json({ error: String(e) });
  }
});

aiRouter.post("/magic-mirror-fit", async (req, res) => {
  const body = req.body as {
    buyerName?: string;
    listingTitle?: string;
    buyerMeasurements?: Record<string, unknown>;
    garmentMeasurements?: Record<string, unknown>;
    listingDescription?: string;
  };
  try {
    const result = await analyzeMagicMirrorFit({
      buyerName: body.buyerName?.trim() || "Pirkėja",
      listingTitle: body.listingTitle?.trim() || "Drabužis",
      buyerMeasurements: (body.buyerMeasurements ?? {}) as import("../ai/magic-mirror.js").BodyMeasurements,
      garmentMeasurements: (body.garmentMeasurements ?? {}) as import("../ai/magic-mirror.js").GarmentMeasurements,
      listingDescription: body.listingDescription,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/price-appraisal", async (req, res) => {
  const body = req.body as {
    imageMetadata?: Record<string, unknown>;
    category?: string;
  };
  const category = body.category?.trim() || "other";
  const meta = (body.imageMetadata ?? {}) as import("../ai/price-appraisal.js").ImageMetadata;

  try {
    const listings = (await getListings()).map(toAgentListingSummary);
    const result = await calculateAppraisal(meta, category, listings);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/negotiation-twin", async (req: AuthedRequest, res) => {
  const body = req.body as {
    buyerMessage?: string;
    listingPrice?: number;
    minPrice?: number;
    listingTitle?: string;
    sellerName?: string;
    sellerUserId?: string;
    sellerApproved?: boolean;
    autoNegotiationEnabled?: boolean;
    sellerConsent?: boolean | string;
    maxDiscountPercent?: number;
    threadId?: string;
    listingId?: string;
    profileType?: string;
  };
  if (!body.buyerMessage?.trim()) {
    return res.status(400).json({ error: "buyerMessage is required" });
  }
  try {
    const minPrice = Number(body.minPrice) || 0;
    const listingPrice = Number(body.listingPrice) || 0;

    let profileType = resolveNegotiationProfileType(body.profileType);
    const sellerUserId = body.sellerUserId?.trim();
    if (!profileType && sellerUserId) {
      const seller = await getUser(sellerUserId);
      profileType = resolveNegotiationProfileType(seller?.profileType);
    }
    if (
      !profileType &&
      req.authUserId &&
      (!sellerUserId || sellerUserId === req.authUserId)
    ) {
      const seller = await getUser(req.authUserId);
      profileType = resolveNegotiationProfileType(seller?.profileType);
    }

    const result = await runAutoNegotiation({
      buyerMessage: body.buyerMessage.trim(),
      listingPrice,
      minPrice,
      listingTitle: body.listingTitle?.trim() || "Skelbimas",
      sellerName: body.sellerName?.trim() || "Pardavėja",
      profileType,
      threadId: body.threadId?.trim(),
      listingId: body.listingId?.trim(),
      sellerUserId: sellerUserId ?? req.authUserId,
      rules: {
        minPrice,
        listingPrice,
        sellerApproved: body.sellerApproved !== false,
        autoNegotiationEnabled: body.autoNegotiationEnabled !== false,
        sellerConsent: body.sellerConsent,
        maxDiscountPercent: body.maxDiscountPercent,
      },
    });
    res.json(result);
  } catch (e) {
    logProductionError("negotiation-twin", e);
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/generate-description-personas", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const body = req.body as {
    title?: string;
    category?: string;
    price?: number;
    location?: string;
    attributes?: Record<string, string>;
    baseDescription?: string;
  };

  if (!body.title?.trim() || !body.category?.trim()) {
    return res.status(400).json({ error: "title and category are required" });
  }

  try {
    const variants = await generateBuyerPersonaDescriptions({
      title: body.title.trim(),
      category: body.category.trim(),
      price: body.price,
      location: body.location,
      attributes: body.attributes,
      baseDescription: body.baseDescription,
    });
    res.json(variants);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/chat-shield", async (req, res) => {
  const body = req.body as {
    message?: string;
    listingPrice?: number;
    listingTitle?: string;
    sellerName?: string;
  };

  if (!body.message?.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    let result = await analyzeChatShield({
      message: body.message.trim(),
      listingPrice: Number(body.listingPrice) || 0,
      listingTitle: body.listingTitle?.trim() || "Skelbimas",
      sellerName: body.sellerName,
    });
    if (result.shouldShield && hasAiKey()) {
      result = await refineChatShieldReply(
        {
          message: body.message.trim(),
          listingPrice: Number(body.listingPrice) || 0,
          listingTitle: body.listingTitle?.trim() || "Skelbimas",
          sellerName: body.sellerName,
        },
        result
      );
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/reference-images", async (req, res) => {
  const { query, category, limit = 4 } = req.body as {
    query: string;
    category?: string;
    limit?: number;
  };

  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", query.trim());
    url.searchParams.set("gsrlimit", String(Math.min(limit, 6)));
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url");
    url.searchParams.set("iiurlwidth", "400");

    const wikiRes = await fetch(url.toString(), {
      headers: { "User-Agent": "VautoApp/1.0" },
    });

    const images: string[] = [];
    if (wikiRes.ok) {
      const data = (await wikiRes.json()) as {
        query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; url?: string }[] }> };
      };
      for (const page of Object.values(data.query?.pages ?? {})) {
        const thumb = page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url;
        if (thumb) images.push(thumb);
      }
    }

    if (!images.length) {
      const key = category && REFERENCE_FALLBACK[category] ? category : "other";
      res.json({ images: (REFERENCE_FALLBACK[key] ?? REFERENCE_FALLBACK.other).slice(0, limit) });
      return;
    }

    res.json({ images: images.slice(0, limit) });
  } catch {
    const key = category && REFERENCE_FALLBACK[category] ? category : "other";
    res.json({ images: (REFERENCE_FALLBACK[key] ?? REFERENCE_FALLBACK.other).slice(0, limit) });
  }
});

aiRouter.post("/extract-combined", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { imageDataUrl, imageDataUrls, text, extraContext, userCity, contact } =
    req.body as {
      imageDataUrl?: string;
      imageDataUrls?: string[];
      text?: string;
      extraContext?: string;
      userCity?: string;
      contact?: string;
    };
  const city = userCity || "Lietuva";
  const phone = contact || "+370 612 34567";
  const images =
    Array.isArray(imageDataUrls) && imageDataUrls.length
      ? imageDataUrls
      : imageDataUrl
        ? [imageDataUrl]
        : [];
  const transcript = [text, extraContext]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!images.length || !transcript) {
    return res.status(400).json({ error: "imageDataUrl and text are required" });
  }

  const imageCountNote =
    images.length > 1
      ? ` Vartotojas įkėlė ${images.length} nuotraukas — naudok visas analizei.`
      : "";

  try {
    const pipeline = await runVisualPipelineForExtract(images, {
      listingTitle: transcript.slice(0, 120),
    });
    const visionImages = imagesAfterPipeline(pipeline, images);
    const raw = await visionExtractJson(
      `Ištrauk skelbimo duomenis iš nuotraukos IR vartotojo balso/teksto aprašymo vienu kartu. ${VEHICLE_VISION_RULES} Tekstas turi prioritetą kainai, vietai ir detalėms; nuotrauka — objekto atpažinimui ir kategorijai.${imageCountNote} Vartotojo aprašymas: "${transcript}" JSON: ${EXTRACTION_SCHEMA}. Miestas: ${city}`,
      visionImages
    );
    const listing = toListing(raw, city, phone);
    mergePipelineIntoListingFields(listing, pipeline);
    res.json({
      ...listing,
      visualPipeline: visualPipelineResponseSlice(pipeline),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/import-url", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json({ ...AI_UNAVAILABLE, code: "unavailable" });

  const { url, userCity, contact } = req.body as {
    url: string;
    userCity?: string;
    contact?: string;
  };

  if (!url?.trim()) {
    return res.status(400).json({ error: "url is required", code: "missing_url" });
  }

  const city = userCity || "Lietuva";
  const phone = contact || "+370 612 34567";

  function stripHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  try {
    let pageRes: Response;
    try {
      pageRes = await fetch(url.trim(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; VautoBot/1.0; +https://vauto-chi.vercel.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (fetchErr) {
      const isTimeout =
        fetchErr instanceof Error &&
        (fetchErr.name === "AbortError" || fetchErr.name === "TimeoutError");
      return res.status(502).json({
        error: isTimeout
          ? "Portalo puslapis neatsakė laiku — bandykite vėliau arba užpildykite ranka."
          : "Nepavyko pasiekti portalo — patikrinkite nuorodą arba užpildykite ranka.",
        code: isTimeout ? "timeout" : "fetch_failed",
      });
    }

    if (!pageRes.ok) {
      return res.status(502).json({
        error: "Portalo puslapis neprieinamas — užpildykite skelbimą ranka.",
        code: "fetch_failed",
      });
    }

    const html = await pageRes.text();
    const text = stripHtml(html).slice(0, 14_000);

    if (text.length < 80) {
      return res.status(422).json({
        error: "Puslapio turinys per trumpas — užpildykite laukus ranka.",
        code: "empty_content",
      });
    }

    const raw = await chatJson([
      {
        role: "system",
        content:
          "Ištrauk skelbimo duomenis iš lietuviško portalo HTML. VAUTO veikia visoje Lietuvoje. Grąžink attributes su giliais laukais (auto: year, mileage, bodyType; NT: propertyType, area, heating; drabužiai: size, condition; darbas: jobTitle, salaryGross).",
      },
      {
        role: "user",
        content: `URL: ${url}\nTekstas:\n"""${text}"""\nJSON: ${EXTRACTION_SCHEMA}\nMiestas: ${city}`,
      },
    ]);
    const listing = toListing(raw, city, phone);
    listing.attributes = {
      ...listing.attributes,
      _importUrl: url.trim(),
    };
    res.json(listing);
  } catch (e) {
    res.status(500).json({
      error: "Nepavyko apdoroti importo — užpildykite skelbimą ranka.",
      code: "parse_failed",
    });
  }
});

aiRouter.post("/extract-text", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { text, userCity, contact } = req.body as {
    text: string;
    userCity?: string;
    contact?: string;
  };
  const city = userCity || "Lietuva";
  const phone = contact || "+370 612 34567";

  try {
    const raw = await chatJson([
      {
        role: "system",
        content:
          "Ištrauk skelbimo duomenis iš lietuviško teksto. Nustatyk kategoriją ir attributes laukus. Jei kainos nėra — price: 0.",
      },
      {
        role: "user",
        content: `Tekstas: "${text}"\nJSON: ${EXTRACTION_SCHEMA}\nMiestas: ${city}`,
      },
    ]);
    res.json(toListing(raw, city, phone));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/image-search", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { imageDataUrl, limit = 40 } = req.body as {
    imageDataUrl?: string;
    limit?: number;
  };

  if (!imageDataUrl?.trim()) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  try {
    const { imageSearchScores } = await import("../ai/image-embedding.js");
    const scores = await imageSearchScores(imageDataUrl, limit);
    res.json({ scores });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/semantic-search", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { profile, limit = 40 } = req.body as {
    profile?: {
      title?: string;
      category?: string;
      price?: number;
      location?: string;
      description?: string;
    };
    limit?: number;
  };

  if (!profile?.title) {
    return res.status(400).json({ error: "profile.title is required" });
  }

  try {
    const { buildVisualProfileText, semanticSearchScores } = await import(
      "../ai/listing-embedding.js"
    );
    const queryText = buildVisualProfileText({
      title: profile.title,
      category: profile.category ?? "other",
      location: profile.location,
      description: profile.description,
      price: profile.price,
    });
    const scores = await semanticSearchScores(queryText, limit);
    res.json({ scores });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/visual-rank", async (req, res) => {
  if (!hasAiKey()) return res.status(503).json(AI_UNAVAILABLE);

  const { profile, candidates } = req.body as {
    profile?: {
      title?: string;
      category?: string;
      price?: number;
      location?: string;
      description?: string;
    };
    candidates?: {
      id: string;
      title: string;
      category: string;
      price: number;
      location: string;
    }[];
  };

  if (!profile?.title || !Array.isArray(candidates) || !candidates.length) {
    return res.status(400).json({ error: "profile.title and candidates[] required" });
  }

  const listText = candidates
    .slice(0, 40)
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id} | ${c.title} | ${c.category} | ${c.price}€ | ${c.location}`
    )
    .join("\n");

  const prompt = `Vartotojas ieško panašių skelbimų pagal AI atpažintą objektą.
Objektas: "${profile.title}" (kategorija: ${profile.category}, kaina ~${profile.price ?? 0}€, vieta: ${profile.location ?? "Lietuva"})
${profile.description ? `Aprašymas: ${profile.description}` : ""}

Įvertink kiekvieno kandidato panašumą 0.0–1.0.
Grąžink JSON: { "scores": { "<listing-id>": 0.0-1.0 } }

Kandidatai:
${listText}`;

  try {
    const raw = await chatJson([
      {
        role: "system",
        content:
          "Esi VAUTO paieškos rerankeris. Grąžink tik JSON su scores objektu.",
      },
      { role: "user", content: prompt },
    ]);

    const scores =
      raw.scores && typeof raw.scores === "object"
        ? (raw.scores as Record<string, unknown>)
        : {};
    const normalized: Record<string, number> = {};
    for (const c of candidates) {
      const v = Number(scores[c.id]);
      if (Number.isFinite(v)) normalized[c.id] = Math.min(1, Math.max(0, v));
    }

    res.json({ scores: normalized });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/listing-share", async (req, res) => {
  const body = req.body as {
    listingId?: string;
    slug?: string;
    title?: string;
    price?: number;
    city?: string;
    category?: string;
    description?: string;
    attributes?: Record<string, unknown>;
    imageAlt?: string;
  };

  const listingId = String(body.listingId ?? "").trim();
  const title = String(body.title ?? "").trim();
  if (!listingId || !title) {
    return res.status(400).json({ error: "listingId and title are required" });
  }

  try {
    const copy = await generateListingShareCopy({
      listingId,
      slug: body.slug ? String(body.slug) : undefined,
      title,
      price: Number(body.price) || 0,
      city: String(body.city ?? "Lietuva"),
      category: String(body.category ?? "other"),
      description: body.description ? String(body.description) : undefined,
      attributes: body.attributes,
      imageAlt: body.imageAlt ? String(body.imageAlt) : undefined,
    });
    res.json({ ok: true, ...copy });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

aiRouter.post("/analyze-report", async (req, res) => {
  const { comment, category, listingTitle, chatPreview } = req.body as {
    comment?: string;
    category?: string;
    listingTitle?: string;
    chatPreview?: string;
  };

  if (!comment?.trim() || !category?.trim()) {
    return res.status(400).json({ error: "comment and category required" });
  }

  try {
    const { analyzeReportWithAi } = await import("../ai/report-analysis.js");
    const analysis = await analyzeReportWithAi({
      comment: comment.trim(),
      category: category.trim(),
      listingTitle,
      chatPreview,
    });
    res.json(analysis);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
