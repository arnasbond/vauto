import { uploadImageToCloudinary, isCloudinaryConfigured } from "./cloudinary.js";
import { resolveListingCity } from "../lib/city-resolve.js";
import { unifiedLlmJson } from "./llm-provider.js";
import { generateImageMetadata } from "./image-metadata-generator.js";
import { applyVautoWatermark, optimizeListingImage } from "./image-processor.js";
import { runVisionAntiFraudGuard } from "./vision-anti-fraud.js";
import { VISION_ANTI_HALLUCINATION_RULE } from "./vision-guardrails.js";
import { normalizeImageInputList } from "./image-input.js";
import { enrichSellerListingFromText } from "./seller-listing-fallback.js";

export const VAUTO_UNIFIED_SCHEMA = `{
  "intent": "sell | search | service | general",
  "category": "AUTOMOBILIAI | NT | ELEKTRONIKA | DARBAS | NAMAI | SPORTAS | APRANGA | PASLAUGOS | VAIKAMS | GYVUNAI",
  "title": "string — patrauklus lietuviškas skelbimo pavadinimas",
  "price": "number | null — kaina EUR; null jei nenurodyta",
  "city": "string — tikras Lietuvos miestas (Vilnius, Kaunas, …). NIEKADA žodis Miestas ar placeholder",
  "description": "string — pilnas profesionalus skelbimo aprašymas lietuviškai (4–8 sakiniai, be emoji, pirkėjus traukiantis tonas)",
  "technicalFields": "object — kategorijai būdingi laukai (metai, kuroTipas, markė, modelis, mileage, dydis, būklė, kambariai ir pan.)",
  "confidence": "number 0-1"
}`;

const SYSTEM_RULES = `Tu esi VAUTO — išmanus lietuviškas skelbimų portalo AI asistentas.
Visada grąžink TIK vieną JSON objektą pagal schemą — jokio markdown.
Suprask laisvą lietuvišką tekstą arba nuotrauką: ar vartotojas nori PARDUOTI (sell), IEŠKOTI (search), PASLAUGOS (service), ar bendrai (general).
Kategoriją parink tiksliai pagal objektą. Aprašymą (description) sugeneruok išsamiai lietuviškai — ne vieno sakinio suvestinė, o pilnas skelbimo tekstas su nauda pirkėjui, būkle, komplektacija ir kita svarbia informacija iš vartotojo žinutės.
Jei kainos ar miesto nėra — price: null; city: naudok numatytąjį miestą iš užklausos (tikras pavadinimas, ne „Miestas“).

KATEGORIJŲ TAISYKLĖS (griežtai):
- NT (nekilnojamasis turtas): jei tekste yra butas/butą/butai, namas/namą/namai, žemė/žeme, sklypas, sodyba, kotedžas, patalpos, garažas, nekilnojamasis — category PRIVALO būti „NT“, NE „NAMAI“ (NAMAI = buitinės prekės).
- AUTOMOBILIAI: jei tekste yra auto/automobilis/automobili, mašina/masina, transportas, rida, markė — category „AUTOMOBILIAI“, net be konkretaus modelio.
- ANTRAŠTĖ (title): sugeneruok patrauklią lietuvišką pardavimo antraštę pagal TIKRĄ objektą iš vartotojo žinutės ar nuotraukos. NIEKADA nenaudok „Universalus daiktas“, „Prekė“ ar kitų bendrinių placeholderių. Nenaudok fiksuotų šabloninių modelių (pvz. iPhone 15 Pro), jei vartotojas nurodė kitą modelį.
- Jei objektas neaiškus arba nuotraukoje tik fonas/kambarys — confidence < 0.3, price: null, title minimalus.
- NEAIŠKUS KAMBARIO VAIZDAS: NEPRISKIR PASLAUGOS. technicalFields gali turėti clarificationPrompt — lietuvišką klausimą su 2–3 alternatyvomis (pvz. „Ar parduodate televizorių, baldą, ar siūlote paslaugas?").
- Jei negali tiksliai nustatyti objekto — description lauke įrašyk šiltą patikslinimo klausimą vartotojui, ne išgalvotą skelbimą.

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
Svarbu: lauką description užpildyk pilnu, profesionaliu skelbimo aprašymu lietuviškai (mažiausiai 4 sakiniai).
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

Analizuok nuotrauką(-as). Atpažink TIKSLŲ objektą — pavadinimas ir kategorija turi atitikti tai, ką matai. Jei objektas neaiškus — confidence < 0.3, nepriskirk PASLAUGOS be aiškaus paslaugų konteksto.${textNote}${extra}
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
    const rawParsed = await unifiedLlmJson({
      prompt: buildImagePrompt(city, body.text, body.extraContext),
      imageDataUrls: images,
    });
    const raw = combinedText
      ? enrichSellerListingFromText(combinedText, rawParsed)
      : rawParsed;
    const listing = toListingPayload(raw, city, contact);

    const [visualSeo, antiFraud] = await Promise.all([
      generateImageMetadata({
        listingTitle: listing.title,
        category: listing.category,
        city: listing.location,
        attributes: listing.attributes as Record<string, unknown>,
        imageDataUrl: images[0],
      }).catch(() => ({
        alt: listing.title,
        title: listing.title,
        description: listing.description,
      })),
      runVisionAntiFraudGuard(images, {
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
    };
  }

  throw Object.assign(new Error(`Unknown action: ${action}`), { status: 400 });
}
