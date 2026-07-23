import { uploadImageToCloudinary, isCloudinaryConfigured } from "./cloudinary.js";
import { resolveListingCity } from "../lib/city-resolve.js";
import { unifiedLlmJson } from "./llm-provider.js";
import { generateImageMetadata } from "./image-metadata-generator.js";
import { applyVautoWatermark, optimizeListingImage } from "./image-processor.js";
import {
  VISION_ANTI_HALLUCINATION_RULE,
  VISION_MASTER_SALES_COPYWRITER_RULE,
} from "./vision-guardrails.js";
import { normalizeImageInputList } from "./image-input.js";
import { enrichSellerListingFromText } from "./seller-listing-fallback.js";
import {
  hardFilterPublicGalleryUrls,
  splitGalleryAndDocumentUrls,
} from "./listing-gallery-roles.js";
import {
  buildMultiObjectClarificationPrompt,
  chipsFromDetectedObjects,
  parseChoiceChips,
  parseDetectedObjects,
} from "./vision-multi-object.js";
import { STRUCTURED_INPUT_VISION_RULES, TEXT_AND_VISION_INPUT_ONLY } from "./structured-input-pipeline.js";
import {
  imagesAfterPipeline,
  mergePipelineIntoListingFields,
  runVisualPipelineForExtract,
  visualPipelineResponseSlice,
} from "../services/visual-pipeline.js";
import { DOCUMENT_OCR_SOFT_NOTE } from "./sell-intent-fallback.js";
import { VAUTO_DOMAIN_AUTONOMY_RULES } from "../shared/vauto-domain-autonomy.js";
import {
  LAZY_UPLOAD_LOG_TAG,
  LAZY_UPLOAD_PHASE,
  type LazyUploadPhase,
} from "../shared/lazy-upload.js";
import { enrichVehicleVisionDraft } from "../shared/vehicle-vision-enrich.js";

function isSoftUnclearDocument(raw: Record<string, unknown>): boolean {
  const readable = raw.documentReadable;
  if (readable === false || String(readable).toLowerCase() === "false") return true;
  const ocrConf = Number(raw.documentOcrConfidence);
  if (Number.isFinite(ocrConf) && ocrConf < 0.55) return true;
  if (Array.isArray(raw.unclearDocumentIndexes) && raw.unclearDocumentIndexes.length > 0) {
    return true;
  }
  return false;
}

const VAUTO_UNIFIED_SCHEMA = `{
  "intent": "sell | search | service | general",
  "category": "AUTOMOBILIAI | NT | ELEKTRONIKA | DARBAS | NAMAI | SPORTAS | APRANGA | PASLAUGOS | VAIKAMS | GYVUNAI",
  "title": "string — įtraukiantis LT marketplace pavadinimas. Auto: markė + VISAS modelis VERBATIM + metai (pvz. „Citroën Grand C4 Picasso 2007“). Prekės/menas: engaginantis (pvz. „Originalus abstraktus paveikslas ant drobės (Rankų darbas)“)",
  "price": "number | null — kaina EUR; null jei nenurodyta / neišgalvota",
  "city": "string — tikras Lietuvos miestas (Vilnius, Kaunas, …). NIEKADA žodis Miestas ar placeholder",
  "description": "string — MASTER SALES COPY lietuviškai su Markdown: hook pastraipa + • **Ypatybės:** bullet'ai + closing CTA. PALIK \\n ir **. DRAUDŽIAMA sausas caption („pavaizduoti rudi taškeliai…“). DRAUDŽIAMA išgalvoti kainą, ridą, TA",
  "technicalFields": "object — make, model, year, firstRegistration (YYYY-MM-DD), trim, engine, powerKw, fuelType, mileage, bodyType, transmission, color, seats, vin, plate, licensePlate, interiorCondition, exteriorFeatures, condition, euroStandard, curbWeight + laisvi marketplace raktai (Atlikimas, Paskirtis…)",
  "documentImageIndexes": "[number] — 0-based indeksai tech passport / registracija (PRIMARY ground-truth OCR, NE viešai galerijai)",
  "galleryImageIndexes": "[number] — 0-based indeksai TIK produkto/auto nuotraukų viešai galerijai",
  "imageRoles": "[\\"gallery\\"|\\"document\\"] — PRIVALOMAS masyvas: po vieną role KIEKVIENAI nuotraukai eilės tvarka; document = primary tech source",
  "documentReadable": "boolean — true TIK jei tech passport / dokumento tekstas aiškiai įskaitomas",
  "documentOcrConfidence": "number 0-1 — OCR patikimumas; <0.55 = neaišku",
  "unclearDocumentIndexes": "[number] — neaiškių dokumentų indeksai",
  "confidence": "number 0-1",
  "sceneContext": "string — trumpas kontekstas",
  "detectedObjects": [{ "label": "string", "category": "string", "confidence": "number 0-1" }],
  "choiceChips": ["string"]
}`;

const SYSTEM_RULES = `Tu esi VAUTO Smart Assistant — daugiakategorės skelbimų AI + MASTER SALES COPYWRITER. Grąžink TIK vieną JSON objektą.

${VAUTO_DOMAIN_AUTONOMY_RULES}

${VISION_MASTER_SALES_COPYWRITER_RULE}

OCR + FAKTAI (ground-truth → technicalFields / attributes; NE sausas description caption):
- Tech passport / registracijos / dokumentų nuotraukos: imageRoles=document + documentImageIndexes.
- MULTIMODAL FUSION (kai yra ir tech passport, ir auto nuotraukos):
  Tech passport / documentImageIndexes = PRIMARY ground-truth (prioritetas prieš vizualines spekuliacijas).
  HARD SPECS iš paso: A→plate/licensePlate, B→firstRegistration PILNA data YYYY-MM-DD (+ year YYYY), D.1→make, D.3→model (VERBATIM — žr. MODEL FIDELITY), S.1→seats, P.1→engine (cm³ → litrai, pvz. 1997→2.0), P.2→powerKw, P.3→fuelType, R→color, V.9→euroStandard, G→curbWeight, C.1.3→city, E→vin.
  VISUAL EXTRAS iš auto nuotraukų → technicalFields + sales description bullet'ai:
    interiorCondition — odinis/kombinuotas salonas, porankiai, mentelės prie vairo, bagažinės kilimėlis / erdvi bagažinė.
    exteriorFeatures — ratlankiai, stogo bėgeliai (rilingai), langų deflektoriai, vilkimo kablys (TIK jei matosi).
    transmission — jei matomos mentelės prie vairo → „Automatinė / EGS (pusiau automatinė)“.
  GRAND LOGIKA: jei S.1=7 arba vizualiai 7 vietos / Grand — model/title „Grand C4 Picasso“ (ne trumpinti į C4 Picasso).
  DRAUDŽIAMA išgalvoti kainą, ridą ar TA (techninę apžiūrą) — tik jei vartotojas aiškiai parašė.
- MODEL FIDELITY (ABSOLIUTU): technicalFields.model ir title privalo būti EXACT D.3 / ženkliuko eilutė. NIEKADA trumpinti: „Grand C4 Picasso“ ≠ „C4 Picasso“; „Gran Coupe“, „Avant“, „xDrive“ — VISADA palikti.
- Jei dalinai neryšku: documentReadable=false + documentOcrConfidence, BET VIS TIEK grąžink matomus laukus + turtingą description iš to, kas matoma.
- galleryImageIndexes / imageRoles=gallery — TIK produkto/auto nuotraukos. Žalias/mėlynas tech passport VISADA document.
- Jei faktas nematomas — praleisk, neišgalvok. Kainos ir miesto NEGALIMA išgalvoti.

${TEXT_AND_VISION_INPUT_ONLY}

${STRUCTURED_INPUT_VISION_RULES}

KATEGORIJŲ TAISYKLĖS:
- NT: butas/namas/sklypas → „NT“, NE „NAMAI“.
- AUTOMOBILIAI: auto/mašina/rida/markė → „AUTOMOBILIAI“.
- title: engaginantis marketplace pavadinimas; auto — su VISU modeliu.
- Jei keli PARDUODAMI objektai — detectedObjects + choiceChips; confidence < 0.5 jei neaišku.
- DRAUDŽIAMA į detectedObjects / choiceChips dėti tech passport, registracijos liudijimą, kvitą ar kitą dokumentą — jie tik OCR (documentImageIndexes), ne parduodamas objektas.
- Automobiliams technicalFields: make, model, year, trim, engine, powerKw, fuelType, mileage, bodyType, transmission, color, seats, vin, plate, licensePlate, interiorCondition, exteriorFeatures, condition.
NT: propertyType, area, rooms, floor, heating. Elektronikai: brand, model, condition. Menas/namai: Atlikimas, Paskirtis, Spalvos, Būklė.`;

const CATEGORY_TO_INTERNAL: Record<string, string> = {
  AUTOMOBILIAI: "vehicles",
  NT: "real_estate",
  ELEKTRONIKA: "electronics",
  DARBAS: "jobs",
  NAMAI: "home",
  SPORTAS: "other",
  APRANGA: "clothing",
  PASLAUGOS: "services",
  VAIKAMS: "other",
  GYVUNAI: "other",
};

function parseTechnicalFields(raw: unknown): Record<string, string | string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) out[k] = v.map(String);
    else out[k] = String(v);
  }
  // Model: whitespace-only cleanup — NEVER truncate Grand/Gran/Avant/xDrive variants.
  if (typeof out.model === "string") {
    out.model = out.model.trim().replace(/\s+/g, " ");
  }
  // P.1 often arrives as cm³ — normalize to liters for structured state.
  const engineRaw = String(out.engine ?? "").trim();
  const cm3 = engineRaw.match(/(\d{3,4})\s*(?:cm|cm³|cc)?/i);
  if (cm3 && !/\d[.,]\d/.test(engineRaw)) {
    const liters = Math.round((Number(cm3[1]) / 1000) * 10) / 10;
    if (liters > 0.5 && liters < 10) out.engine = String(liters);
  }
  if (out.plate && !out.licensePlate) out.licensePlate = out.plate;
  if (out.licensePlate && !out.plate) out.plate = out.licensePlate;
  return out;
}

export interface VautoUnifiedParsed {
  intent: string;
  category: string;
  title: string;
  price: number | null;
  city: string;
  description: string;
  technicalFields: Record<string, string | string[]>;
  confidence: number;
}

export interface VautoListingPayload {
  title: string;
  price: number;
  location: string;
  contact: string;
  category: string;
  description?: string;
  confidence: number;
  attributes: Record<string, string | string[]>;
  intent?: string;
  isVerified?: boolean;
  requiresReview?: boolean;
  imageAlt?: string;
  imageTitle?: string;
  reviewNotice?: string;
}

function toListingPayload(
  raw: Record<string, unknown>,
  userCity: string,
  contact: string
): VautoListingPayload {
  const categoryKey = String(raw.category ?? "").toUpperCase();
  const internalCategory = CATEGORY_TO_INTERNAL[categoryKey] ?? "other";
  const priceRaw = raw.price;
  const price =
    priceRaw === null || priceRaw === undefined ? 0 : Number(priceRaw) || 0;

  const technicalFields = parseTechnicalFields(raw.technicalFields ?? raw.attributes);
  const detectedObjects = parseDetectedObjects(raw.detectedObjects);
  const sceneContext = String(raw.sceneContext ?? technicalFields.sceneContext ?? "").trim();
  let choiceChips = parseChoiceChips(raw.choiceChips ?? technicalFields.choiceChips, "sell");
  if (choiceChips.length < 2 && detectedObjects.length >= 2) {
    choiceChips = chipsFromDetectedObjects(detectedObjects, "sell");
  }
  // Car + tech passport → single sellable object; never ask which to sell.
  const clarificationPrompt =
    detectedObjects.length >= 2
      ? String(technicalFields.clarificationPrompt ?? "").trim() ||
        buildMultiObjectClarificationPrompt(sceneContext, detectedObjects, "sell")
      : "";

  const userCityResolved = resolveListingCity(userCity, "Vilnius");

  return {
    title: String(raw.title ?? "Skelbimas"),
    price,
    location: resolveListingCity(
      String(raw.city ?? raw.location ?? ""),
      userCityResolved
    ),
    contact,
    category: internalCategory,
    description: raw.description ? String(raw.description) : undefined,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.85)),
    attributes: {
      ...technicalFields,
      _intent: String(raw.intent ?? "sell"),
      _vautoCategory: categoryKey,
      ...(sceneContext ? { sceneContext } : {}),
      ...(detectedObjects.length
        ? { detectedObjects: JSON.stringify(detectedObjects) }
        : {}),
      ...(choiceChips.length ? { choiceChips: choiceChips.join("|") } : {}),
      ...(clarificationPrompt ? { clarificationPrompt } : {}),
    },
    intent: String(raw.intent ?? "sell"),
  };
}

function buildTextPrompt(text: string, userCity: string, extraContext?: string): string {
  const extra = extraContext?.trim()
    ? `\nPapildomas kontekstas: ${extraContext.trim()}`
    : "";
  return `${SYSTEM_RULES}

Vartotojo tekstas: """${text}"""${extra}
Numatytas miestas jei nepaminėtas: ${userCity}
Pavyzdys: „Parduodu citroena" → intent sell, category AUTOMOBILIAI, title „Parduodamas Citroën“, technicalFields.make Citroën.
description: MASTER SALES COPYWRITER formatas (hook + bullet ypatybės + CTA), faktai tikri.
Grąžink JSON: ${VAUTO_UNIFIED_SCHEMA}`;
}

function buildImagePrompt(
  userCity: string,
  text?: string,
  extraContext?: string
): string {
  const textNote = text?.trim()
    ? `\nVartotojo papildomas aprašymas (prioritetas kainai ir detalėms): """${text.trim()}"""`
    : "";
  const extra = extraContext?.trim()
    ? `\nKontekstas: ${extraContext.trim()}`
    : "";
  return `${SYSTEM_RULES}
${VISION_ANTI_HALLUCINATION_RULE}

Analizuok VISAS nuotraukas eilės tvarka (indeksai 0..n-1). Pirmos document nuotraukos = PRIMARY OCR šaltinis.
1) PRIVALOMA imageRoles masyvas (gallery|document) kiekvienai nuotraukai. Žalias/mėlynas tech passport, registracija, kvitas, popierius su lentele/VIN — VISADA document (ground-truth).
2) documentImageIndexes + galleryImageIndexes privalo sutapti su imageRoles.
3) HARD SPECS — Lietuviškas techninis pasas (OCR, PRIORITETAS prieš vizualines spekuliacijas):
   • A = valstybinis numeris → technicalFields.plate + licensePlate
   • B = pirmoji registracija → technicalFields.firstRegistration PILNA data YYYY-MM-DD IR technicalFields.year (YYYY). DRAUDŽIAMA palikti tik metus, jei diena/mėnuo matomi.
   • D.1 = markė → technicalFields.make
   • D.3 = modelis → technicalFields.model — VERBATIM. Jei S.1=7 vietos ir modelis „C4 Picasso“ — rašyk „Grand C4 Picasso“.
   • S.1 = sėdimos vietos → technicalFields.seats
   • E = VIN → technicalFields.vin
   • P.1 = darbinis tūris cm³ → technicalFields.engine LITRAIS (1997 cm³ → „2.0“)
   • P.2 = galia → technicalFields.powerKw (kW)
   • P.3 = degalai → technicalFields.fuelType (Benzinas / Dyzelinas / …)
   • R = oficiali spalva → technicalFields.color
   • V.9 = tarša → technicalFields.euroStandard
   • G = masė → technicalFields.curbWeight
   • C.1.3 = savivaldybė / miestas → city (jei aiškiai matoma)
4) VISUAL EXTRAS — tik iš auto (gallery) nuotraukų; rašyk bullet eilutes:
   • interiorCondition — odinis/kombinuotas salonas, porankiai, mentelės prie vairo, guminis bagažinės kilimėlis / erdvi bagažinė
   • exteriorFeatures — ratlankiai, stogo bėgeliai (rilingai), langų deflektoriai, vilkimo kablys (TIK jei matosi)
   • transmission — jei matomos mentelės → „Automatinė / EGS (pusiau automatinė)“
   • bodyType — vienatūris / MPV jei aišku
5) description — MASTER SALES COPYWRITER (hook + **Ypatybės** bullet'ai + CTA). HARD SPECS / OCR faktai → technicalFields IR į description bullet'us.
   • DRAUDŽIAMA sausas caption („pavaizduoti…“, „nuotraukoje matyti…“).
   • DRAUDŽIAMA išgalvoti kainą, ridą, TA.
   • PALIK Markdown ** ir naujas eilutes (\\n) description stringe.
6) NIEKADA neklausti „Patikslinkite metus ir variklį“, jei B/P.1/P.3 jau ištraukti. NIEKADA nekartok vartotojo frazės kaip aprašymo.
7) title — engaginantis marketplace pavadinimas; auto = make + VERBATIM/Grand model + year.
8) Papildomi technicalFields: seats, vin, euroStandard, co2, maxSpeed, curbWeight/maxMass, bodyType, transmission, interiorCondition, exteriorFeatures, firstRegistration + marketplace raktai.${textNote}${extra}
Numatytas miestas: ${userCity}
Grąžink JSON: ${VAUTO_UNIFIED_SCHEMA}`;
}

export type VautoServerAction =
  | "parse_text"
  | "analyze"
  | "analyze_image"
  | "parse_combined"
  | "upload_media";

export interface VautoServerRequest {
  action: VautoServerAction | string;
  text?: string;
  imageDataUrl?: string;
  imageDataUrls?: string[];
  extraContext?: string;
  userCity?: string;
  contact?: string;
  listingId?: string;
  /**
   * PUBLISH-ONLY gate for `upload_media`.
   * Chat Vision must NEVER set this — keep data URLs in-memory until Publikuoti.
   */
  persist?: boolean;
  /** Explicit phase marker (vision | publish). Defaults inferred from persist. */
  phase?: LazyUploadPhase | string;
}

export async function handleVautoServerAction(body: VautoServerRequest) {
  const imagesEarly = normalizeImageInputList(
    Array.isArray(body.imageDataUrls) && body.imageDataUrls.length
      ? body.imageDataUrls
      : body.imageDataUrl
        ? [body.imageDataUrl]
        : []
  );

  let action = body.action;
  if (action === "analyze") {
    action = imagesEarly.length ? "analyze_image" : "parse_text";
  }
  const city = resolveListingCity(body.userCity?.trim(), "Vilnius");
  const contact = body.contact?.trim() || "";

  if (action === "upload_media") {
    const image = body.imageDataUrl;
    if (!image?.trim()) {
      throw Object.assign(new Error("imageDataUrl is required"), { status: 400 });
    }
    const phase =
      body.phase === LAZY_UPLOAD_PHASE.PUBLISH || body.persist === true
        ? LAZY_UPLOAD_PHASE.PUBLISH
        : LAZY_UPLOAD_PHASE.VISION;
    // Lazy Upload invariant: permanent remote storage is publish-only.
    if (phase !== LAZY_UPLOAD_PHASE.PUBLISH) {
      console.warn(
        `${LAZY_UPLOAD_LOG_TAG} blocked upload_media outside publish`,
        { phase, persist: body.persist ?? false }
      );
      return {
        ok: true,
        action,
        url: null,
        deferred: true,
        lazyUpload: true,
        code: "lazy_upload_vision_phase",
        listingId: body.listingId?.trim() || undefined,
      };
    }
    // Reject pathological payloads early (keeps Express/Render from OOMing).
    if (image.length > 12_000_000) {
      throw Object.assign(
        new Error("imageDataUrl is too large (max ~12MB). Compress before upload."),
        { status: 413 }
      );
    }
    if (!isCloudinaryConfigured()) {
      // Soft-fail: client keeps the compressed data URL for /api/listings.
      console.warn(
        `${LAZY_UPLOAD_LOG_TAG} Cloudinary not configured — deferred data-URL fallback`
      );
      return {
        ok: true,
        action,
        url: null,
        deferred: true,
        lazyUpload: true,
        code: "cloudinary_not_configured",
        listingId: body.listingId?.trim() || undefined,
      };
    }
    const listingId = body.listingId?.trim() || `tmp-${Date.now()}`;
    let processed = image;
    try {
      processed = await optimizeListingImage(image);
      processed = await applyVautoWatermark(processed, listingId);
    } catch (procErr) {
      console.warn(
        "[upload_media] optimize/watermark failed — uploading original:",
        procErr instanceof Error ? procErr.message : procErr
      );
    }
    try {
      const uploaded = await uploadImageToCloudinary(processed);
      console.log(`${LAZY_UPLOAD_LOG_TAG} publish persist ok`, {
        listingId,
        publicId: uploaded.publicId,
      });
      return {
        ok: true,
        action,
        url: uploaded.url,
        publicId: uploaded.publicId,
        listingId,
        deferred: false,
        lazyUpload: false,
      };
    } catch (uploadErr) {
      const msg =
        uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      console.error("[upload_media] Cloudinary upload failed:", msg.slice(0, 400));
      throw Object.assign(new Error(`Cloudinary upload failed: ${msg}`), {
        status: 502,
      });
    }
  }

  const images = imagesEarly;

  if (action === "parse_text") {
    const text = body.text?.trim();
    if (!text) {
      throw Object.assign(new Error("text is required for parse_text"), { status: 400 });
    }
    const rawParsed = await unifiedLlmJson({
      prompt: buildTextPrompt(text, city, body.extraContext),
    });
    const raw = enrichSellerListingFromText(text, rawParsed);
    const listing = toListingPayload(raw, city, contact);
    return { ok: true, action, parsed: raw, listing };
  }

  if (action === "analyze_image" || action === "parse_combined") {
    if (!images.length) {
      throw Object.assign(new Error("imageDataUrl is required"), { status: 400 });
    }
    const combinedText = body.text?.trim() ?? "";
    const pipeline = await runVisualPipelineForExtract(images, {
      listingTitle: combinedText || body.extraContext?.trim(),
    });
    const visionImages = imagesAfterPipeline(pipeline, images);
    const rawParsed = await unifiedLlmJson({
      prompt: buildImagePrompt(city, body.text, body.extraContext),
      imageDataUrls: visionImages,
    });
    const raw = combinedText
      ? enrichSellerListingFromText(combinedText, rawParsed)
      : rawParsed;
    const listing = enrichVehicleVisionDraft(
      toListingPayload(raw, city, contact)
    ) as VautoListingPayload;
    mergePipelineIntoListingFields(listing, pipeline);

    // Anti-hallucination: drop Vision-invented price/TA without user evidence.
    const userMentionedPrice =
      /\b\d{2,6}\s*(€|eur|eurų|eurai)\b/i.test(combinedText) ||
      /\bkaina\b/i.test(combinedText);
    if (!userMentionedPrice && listing.price > 0) {
      listing.price = 0;
    }
    if (
      listing.attributes &&
      !/\b(ta|technin[eė]\s+apžiūr)/i.test(combinedText)
    ) {
      delete listing.attributes.techInspection;
      delete listing.attributes.ta;
      delete listing.attributes.inspectionValidUntil;
      delete listing.attributes.taValidUntil;
    }

    const visualSeo = await generateImageMetadata({
      listingTitle: listing.title,
      category: listing.category,
      city: listing.location,
      attributes: listing.attributes as Record<string, unknown>,
      imageDataUrl: visionImages[0],
    }).catch(() => ({
      alt: listing.title,
      title: listing.title,
      description: listing.description,
    }));

    // Stock / watermark anti-fraud permanently disabled — never gate Vision results.
    listing.imageAlt = visualSeo.alt;
    listing.imageTitle = visualSeo.title;
    listing.isVerified = true;
    listing.requiresReview = false;
    listing.reviewNotice = "";
    listing.attributes = {
      ...listing.attributes,
      imageAlt: visualSeo.alt,
      imageTitle: visualSeo.title,
      imageSeoDescription: visualSeo.description ?? "",
    };

    return {
      ok: true,
      action,
      parsed: raw,
      listing,
      visualSeo,
      antiFraud: {
        isVerified: true,
        requiresReview: false,
        riskScore: 0,
        reasons: [] as string[],
        userNotice: "",
      },
      visualPipeline: visualPipelineResponseSlice(pipeline),
    };
  }

  throw Object.assign(new Error(`Unknown action: ${action}`), { status: 400 });
}

/** Lightweight vision parse for agent scanListingPhotos — multi-object chips + disambiguation. */
export async function parseListingImagesForAgent(params: {
  imageDataUrls: string[];
  userCity: string;
  contact?: string;
  text?: string;
  extraContext?: string;
  priceHint?: number;
}): Promise<{
  listing: VautoListingPayload;
  choiceChips: string[];
  clarificationPrompt: string;
  needsClarification: boolean;
  galleryUrls: string[];
  documentUrls: string[];
}> {
  const images = normalizeImageInputList(params.imageDataUrls);
  // Lazy Upload: in-memory Gemini only — never Cloudinary / insertListing here.
  console.log(`${LAZY_UPLOAD_LOG_TAG} vision in-memory parse`, {
    phase: LAZY_UPLOAD_PHASE.VISION,
    rawCount: params.imageDataUrls?.length ?? 0,
    normalizedCount: images.length,
    userCity: params.userCity,
    hasContact: Boolean(params.contact?.trim()),
    userTextHead: params.text?.trim().slice(0, 120) ?? null,
    extraContextHead: params.extraContext?.slice(0, 180) ?? null,
    priceHint: params.priceHint ?? null,
  });
  if (!images.length) {
    console.error("[vision] parseListingImagesForAgent: no images after normalize");
    throw new Error("imageDataUrls are required");
  }
  const city = resolveListingCity(params.userCity?.trim(), "Vilnius");
  const contact = params.contact?.trim() || "";
  const combinedText = params.text?.trim() ?? "";
  const prompt = buildImagePrompt(city, params.text, params.extraContext);
  console.log("[vision] parseListingImagesForAgent prompt", {
    promptChars: prompt.length,
    promptHead: prompt.slice(0, 280),
  });
  let rawParsed: Record<string, unknown>;
  try {
    rawParsed = await unifiedLlmJson({
      prompt,
      imageDataUrls: images,
      userTextFallback: combinedText || undefined,
      userCityFallback: city,
      priceHint: params.priceHint,
    });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    // Flat string — Render truncates console.error object payloads.
    console.error(
      `[vision] parseListingImagesForAgent unifiedLlmJson error ${JSON.stringify({
        errMessage,
        stack: err instanceof Error ? err.stack?.slice(0, 700) : undefined,
      })}`
    );
    throw err;
  }
  const raw = combinedText
    ? enrichSellerListingFromText(combinedText, rawParsed)
    : rawParsed;
  const listingRaw = toListingPayload(raw, city, contact);
  const listing = enrichVehicleVisionDraft(listingRaw) as typeof listingRaw;
  // Anti-hallucination: never keep a Vision-invented price unless user/hint provided it.
  const userMentionedPrice =
    /\b\d{2,6}\s*(€|eur|eurų|eurai)\b/i.test(combinedText) ||
    /\bkaina\b/i.test(combinedText);
  if (
    !(params.priceHint != null && params.priceHint > 0) &&
    !userMentionedPrice &&
    listing.price > 0
  ) {
    listing.price = 0;
  }
  // Never keep TA / tech inspection unless user text mentioned it.
  if (
    listing.attributes &&
    !/\b(ta|technin[eė]\s+apžiūr)/i.test(combinedText)
  ) {
    delete listing.attributes.techInspection;
    delete listing.attributes.ta;
    delete listing.attributes.inspectionValidUntil;
    delete listing.attributes.taValidUntil;
  }
  console.log("[vision] parseListingImagesForAgent listing", {
    title: listing.title?.slice(0, 80),
    descriptionChars: listing.description?.length ?? 0,
    category: listing.category,
    confidence: listing.confidence,
    price: listing.price,
    firstRegistration: listing.attributes?.firstRegistration ?? null,
    seats: listing.attributes?.seats ?? null,
    transmission: listing.attributes?.transmission ?? null,
  });

  const { galleryUrls: splitGallery, documentUrls } = splitGalleryAndDocumentUrls(
    images,
    {
      documentImageIndexes: raw.documentImageIndexes,
      galleryImageIndexes: raw.galleryImageIndexes,
      imageRoles: raw.imageRoles,
    }
  );
  // Hard rule: never fall back to the full upload set (would re-inject tech passport).
  const galleryUrls = hardFilterPublicGalleryUrls(splitGallery, documentUrls);

  const documentSoftUnclear =
    documentUrls.length > 0 && isSoftUnclearDocument(raw);
  // Soft OCR: keep every field Gemini could read — never strip or block the draft.
  if (documentSoftUnclear) {
    listing.attributes = {
      ...listing.attributes,
      documentReadable: "false",
      documentOcrUnclear: "true",
      documentOcrSoftNote: DOCUMENT_OCR_SOFT_NOTE,
    };
  }
  if (documentUrls.length) {
    listing.attributes = {
      ...listing.attributes,
      documentImageUrls: documentUrls,
      documentImageCount: String(documentUrls.length),
    };
  }
  console.log("[vision] parseListingImagesForAgent gallery split", {
    galleryCount: galleryUrls.length,
    documentCount: documentUrls.length,
    documentSoftUnclear,
  });

  const detectedObjects = parseDetectedObjects(raw.detectedObjects);
  let choiceChips = parseChoiceChips(
    raw.choiceChips ?? listing.attributes.choiceChips,
    "sell"
  );
  if (choiceChips.length < 2 && detectedObjects.length >= 2) {
    choiceChips = chipsFromDetectedObjects(detectedObjects, "sell");
  }
  const sceneContext = String(raw.sceneContext ?? listing.attributes.sceneContext ?? "").trim();
  const clarificationPrompt =
    detectedObjects.length >= 2
      ? String(listing.attributes.clarificationPrompt ?? "").trim() ||
        buildMultiObjectClarificationPrompt(sceneContext, detectedObjects, "sell")
      : "";

  const quotaFallback =
    String(listing.attributes?.visionQuotaFallback ?? "") === "true";
  const sparseSell = String(listing.attributes?.sparseSell ?? "") === "true";
  // Soft OCR never blocks. Document labels are already stripped from detectedObjects —
  // car + passport must NOT clarify. Only true multi-sellable ambiguity / sparse / low conf.
  const needsClarification =
    sparseSell ||
    (!quotaFallback &&
      !documentSoftUnclear &&
      (listing.confidence < 0.55 ||
        choiceChips.length >= 2 ||
        (detectedObjects.length >= 2 && listing.confidence < 0.72)));

  return {
    listing,
    choiceChips,
    clarificationPrompt,
    needsClarification,
    galleryUrls,
    documentUrls,
  };
}
