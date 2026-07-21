import { uploadImageToCloudinary, isCloudinaryConfigured } from "./cloudinary.js";
import { resolveListingCity } from "../lib/city-resolve.js";
import { unifiedLlmJson } from "./llm-provider.js";
import { generateImageMetadata } from "./image-metadata-generator.js";
import { applyVautoWatermark, optimizeListingImage } from "./image-processor.js";
import { runVisionAntiFraudGuard } from "./vision-anti-fraud.js";
import { VISION_ANTI_HALLUCINATION_RULE } from "./vision-guardrails.js";
import { normalizeImageInputList } from "./image-input.js";
import { enrichSellerListingFromText } from "./seller-listing-fallback.js";
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

export const VAUTO_UNIFIED_SCHEMA = `{
  "intent": "sell | search | service | general",
  "category": "AUTOMOBILIAI | NT | ELEKTRONIKA | DARBAS | NAMAI | SPORTAS | APRANGA | PASLAUGOS | VAIKAMS | GYVUNAI",
  "title": "string — patrauklus lietuviškas skelbimo pavadinimas",
  "price": "number | null — kaina EUR; null jei nenurodyta",
  "city": "string — tikras Lietuvos miestas (Vilnius, Kaunas, …). NIEKADA žodis Miestas ar placeholder",
  "description": "string — pilnas profesionalus skelbimo aprašymas lietuviškai (4–8 sakiniai: akcentai, būklė, nauda pirkėjui, CTA; be emoji; DRAUDŽIAMA 1 sakinio santrauka)",
  "technicalFields": "object — kategorijai būdingi laukai (metai, kuroTipas, markė, modelis, mileage, dydis, būklė, kambariai ir pan.)",
  "confidence": "number 0-1",
  "sceneContext": "string — aplinkos kontekstas (pvz. svetainė, virtuvė, gatvė)",
  "detectedObjects": [{ "label": "string — objekto pavadinimas lietuviškai", "category": "string — kategorija", "confidence": "number 0-1" }],
  "choiceChips": ["string — mygtukų etiketės, pvz. Parduoti televizorių, Parduoti stalą"]
}`;

const SYSTEM_RULES = `Tu esi VAUTO — išmanus lietuviškas skelbimų portalo AI asistentas.
Visada grąžink TIK vieną JSON objektą pagal schemą — jokio markdown.
Suprask laisvą lietuvišką tekstą arba nuotrauką: ar vartotojas nori PARDUOTI (sell), IEŠKOTI (search), PASLAUGOS (service), ar bendrai (general).
Kategoriją parink tiksliai pagal objektą. Aprašymą (description) sugeneruok išsamiai lietuviškai — ne vieno sakinio suvestinė (pvz. „Citroën C4 Picasso automobilis…“), o pilnas skelbimo tekstas: akcentai, būklė, nauda pirkėjui, komplektacija ir aiškus kvietimas susisiekti / apžiūrėti.
Jei kainos ar miesto nėra — price: null; city: naudok numatytąjį miestą iš užklausos (tikras pavadinimas, ne „Miestas“).

${TEXT_AND_VISION_INPUT_ONLY}

${STRUCTURED_INPUT_VISION_RULES}

KATEGORIJŲ TAISYKLĖS (griežtai):
- NT (nekilnojamasis turtas): jei tekste yra butas/butą/butai, namas/namą/namai, žemė/žeme, sklypas, sodyba, kotedžas, patalpos, garažas, nekilnojamasis — category PRIVALO būti „NT“, NE „NAMAI“ (NAMAI = buitinės prekės).
- AUTOMOBILIAI: jei tekste yra auto/automobilis/automobili, mašina/masina, transportas, rida, markė — category „AUTOMOBILIAI“, net be konkretaus modelio.
- ANTRAŠTĖ (title): sugeneruok patrauklią lietuvišką pardavimo antraštę pagal TIKRĄ objektą iš vartotojo žinutės ar nuotraukos. NIEKADA nenaudok „Universalus daiktas“, „Prekė“ ar kitų bendrinių placeholderių. Nenaudok fiksuotų šabloninių modelių (pvz. iPhone 15 Pro), jei vartotojas nurodė kitą modelį.
- Jei objektas neaiškus arba nuotraukoje tik fonas/kambarys — confidence < 0.3, price: null, title minimalus.
- DAUgiatikslė ANALIZĖ: jei nuotraukoje keli objektai (pvz. kambarys + televizorius + stalas) — detectedObjects masyve išvardyk VISUS matomus objektus su confidence.
- choiceChips: sugeneruok 2–4 mygtukų etiketes lietuviškai (pvz. „Parduoti televizorių“, „Parduoti stalą“) — po vieną kiekvienam aiškiam objektui.
- NEAIŠKUS KAMBARIO VAIZDAS: NEPRISKIR PASLAUGOS. sceneContext aprašyk aplinką; technicalFields gali turėti clarificationPrompt.
- Jei negali tiksliai nustatyti vieno objekto — confidence < 0.5, choiceChips privalomi, clarificationPrompt — disambiguation klausimas (ar teisingai suprantu, kurį objektą ruošiame?), ne išgalvotas skelbimas.

Automobiliams technicalFields: make, model, year, fuelType, mileage, bodyType (jei žinoma).
NT: propertyType (butas/namas/sklypas/patalpos), area, rooms, floor, heating. Elektronikai: brand, model, condition.`;

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
  const clarificationPrompt =
    String(technicalFields.clarificationPrompt ?? "").trim() ||
    buildMultiObjectClarificationPrompt(sceneContext, detectedObjects, "sell");

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
Pavyzdys: „Parduodu citroena" → intent sell, category AUTOMOBILIAI, title „Parduodamas Citroën automobilis", technicalFields.make Citroën.
Svarbu: lauką description užpildyk pilnu, profesionaliu skelbimo aprašymu lietuviškai (mažiausiai 4 sakiniai) su akcentais, būkle ir CTA.
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

Analizuok VISAS pateiktas nuotraukas (ne tik pirmą): identifikuok matomus objektus, aplinkos kontekstą (sceneContext) ir pasiūlyk choiceChips jei objektų >1 arba confidence < 0.55.
Jei vienas aiškus objektas — pasirink jį kaip pagrindinį title/category. Jei neaišku — confidence < 0.3, nepriskirk PASLAUGOS be aiškaus paslaugų konteksto.

Aprašymas (description) — PRIVALOMAS pilnas skelbimo tekstas lietuviškai (4–8 sakiniai). Įtrauk:
- matomą spalvą / medžiagą / stilių ir pagrindinius akcentus;
- komplektaciją ar įrangą (jei matoma);
- būklę;
- bet kokius matomus defektus (įbrėžimai, įlenkimai, dėmės, trūkumai). Jei defektų nesimato — parašyk tai aiškiai;
- kvietimą veikti (apžiūra / susisiekti).
DRAUDŽIAMA atsakyti tik „nuotrauka įkelta“, 1 sakinio santrauka ar „… automobilis.“ — aprašymas turi būti pardavimo tekstas pirkėjui.${textNote}${extra}
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
    if (!isCloudinaryConfigured()) {
      throw Object.assign(
        new Error(
          "Cloudinary not configured (CLOUDINARY_CLOUD_NAME + CLOUDINARY_UPLOAD_PRESET)"
        ),
        { status: 503 }
      );
    }
    const listingId = body.listingId?.trim() || `tmp-${Date.now()}`;
    let processed = image;
    try {
      processed = await optimizeListingImage(image);
      processed = await applyVautoWatermark(processed, listingId);
    } catch {
      /* fallback — upload original if sharp unavailable */
    }
    const uploaded = await uploadImageToCloudinary(processed);
    return { ok: true, action, url: uploaded.url, publicId: uploaded.publicId, listingId };
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
    const listing = toListingPayload(raw, city, contact);
    mergePipelineIntoListingFields(listing, pipeline);

    const [visualSeo, antiFraud] = await Promise.all([
      generateImageMetadata({
        listingTitle: listing.title,
        category: listing.category,
        city: listing.location,
        attributes: listing.attributes as Record<string, unknown>,
        imageDataUrl: visionImages[0],
      }).catch(() => ({
        alt: listing.title,
        title: listing.title,
        description: listing.description,
      })),
      runVisionAntiFraudGuard(visionImages, {
        title: listing.title,
        category: listing.category,
      }),
    ]);

    listing.imageAlt = visualSeo.alt;
    listing.imageTitle = visualSeo.title;
    listing.isVerified = antiFraud.isVerified;
    listing.requiresReview = antiFraud.requiresReview;
    listing.reviewNotice = antiFraud.userNotice;
    listing.attributes = {
      ...listing.attributes,
      imageAlt: visualSeo.alt,
      imageTitle: visualSeo.title,
      imageSeoDescription: visualSeo.description ?? "",
      fraudRiskScore: String(antiFraud.riskScore),
    };

    return {
      ok: true,
      action,
      parsed: raw,
      listing,
      visualSeo,
      antiFraud,
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
}> {
  const images = normalizeImageInputList(params.imageDataUrls);
  console.log("[vision] parseListingImagesForAgent enter", {
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
  const listing = toListingPayload(raw, city, contact);
  console.log("[vision] parseListingImagesForAgent listing", {
    title: listing.title?.slice(0, 80),
    descriptionChars: listing.description?.length ?? 0,
    category: listing.category,
    confidence: listing.confidence,
    price: listing.price,
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
    String(listing.attributes.clarificationPrompt ?? "").trim() ||
    buildMultiObjectClarificationPrompt(sceneContext, detectedObjects, "sell");

  const quotaFallback =
    String(listing.attributes?.visionQuotaFallback ?? "") === "true";
  // Quota text-draft must never open multi-object chips / buddy loop.
  const needsClarification =
    !quotaFallback &&
    (listing.confidence < 0.55 ||
      choiceChips.length >= 2 ||
      (detectedObjects.length >= 2 && listing.confidence < 0.72));

  return {
    listing,
    choiceChips,
    clarificationPrompt,
    needsClarification,
  };
}
