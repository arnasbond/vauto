import { uploadImageToCloudinary, isCloudinaryConfigured } from "./cloudinary.js";
import { resolveListingCity } from "../lib/city-resolve.js";
import { unifiedLlmJson } from "./llm-provider.js";
import { generateImageMetadata } from "./image-metadata-generator.js";
import { applyVautoWatermark, optimizeListingImage } from "./image-processor.js";
import {
  VISION_DEEP_OCR_EXTRACTION_RULE,
  VISION_EXTRACTION_ANTI_HALLUCINATION_RULE,
  VISION_REGITRA_TECH_PASSPORT_OCR_RULE,
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
import {
  enrichVehicleVisionDraft,
  normalizeFuelType,
  normalizePowerKw,
  normalizeVin,
} from "../shared/vehicle-vision-enrich.js";
import {
  buildHandbookExtractionFewShots,
  getCategoryPrompter,
} from "./prompters/index.js";

export { getCategoryPrompter } from "./prompters/index.js";
export {
  buildHandbookExtractionFewShots,
  buildHandbookGenerationFewShots,
  VAUTO_SYSTEM_HANDBOOK,
} from "./prompters/index.js";

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

/** Pass 1 — cold structured facts only (no creative sales copy). */
const EXTRACTION_SCHEMA = `{
  "intent": "sell | search | service | general",
  "category": "AUTOMOBILIAI | NT | ELEKTRONIKA | DARBAS | NAMAI | SPORTAS | APRANGA | PASLAUGOS | VAIKAMS | GYVUNAI | MUZIKA | LAISVALAIKIS | MENAS",
  "price": "number | null — kaina EUR; null jei nenurodyta / neišgalvota",
  "city": "string — tikras Lietuvos miestas (Vilnius, Kaunas, …). NIEKADA žodis Miestas ar placeholder",
  "technicalFields": "object — exact facts only from OCR/vision: make, model, year, firstRegistration (YYYY-MM-DD), trim, engine, powerKw, fuelType, mileage, bodyType, transmission, color, seats, vin, plate, licensePlate, interiorCondition, exteriorFeatures, condition, euroStandard, curbWeight, propertyType, area, rooms, floor, heating, brand, instrumentType, specs, languages, battery, contents, Atlikimas, Paskirtis, Spalvos, Būklė…",
  "documentImageIndexes": "[number] — 0-based indeksai tech passport / registracija / pakuotės tekstas (PRIMARY OCR, NE viešai galerijai kai dokumentas)",
  "galleryImageIndexes": "[number] — 0-based indeksai TIK produkto nuotraukų viešai galerijai",
  "imageRoles": "[\\"gallery\\"|\\"document\\"] — PRIVALOMAS masyvas: po vieną role KIEKVIENAI nuotraukai",
  "documentReadable": "boolean — true TIK jei tech passport / etiketės tekstas aiškiai įskaitomas",
  "documentOcrConfidence": "number 0-1 — OCR patikimumas; <0.55 = neaišku",
  "unclearDocumentIndexes": "[number] — neaiškių dokumentų indeksai",
  "confidence": "number 0-1",
  "sceneContext": "string — trumpas faktinis kontekstas",
  "detectedObjects": [{ "label": "string", "category": "string", "confidence": "number 0-1" }],
  "choiceChips": ["string"],
  "factNotes": "string — VISAS perskaitytas OCR tekstas / trumpi faktai be marketingo (pakuotė, etiketė, Regitra)",
  "ocrText": "string — optional raw OCR transcript of legible packaging/passport text"
}`;

/** Pass 2 — creative LT sales copy from extracted JSON. */
const CREATIVE_SCHEMA = `{
  "title": "string — įtraukiantis LT marketplace pavadinimas pagal kategorijos prompterį (su brand/model iš OCR)",
  "description": "string — FACT-GROUNDED LT sales tekstas su Markdown. Sekcijos: **Pavadinimas** hook + **Privalumai** + **Būklė** + **Specifikacijos ir Savybės** (bullet'ai VISIEMS OCR specs) + **Pristatymas / Apžiūra**. PALIK \\n ir **. Draudžiama bendrybės be JSON fakto / sausas caption / išgalvoti specs."
}`;

/** Lightweight Pass-1 system rules — category routing happens in Pass 2. */
const EXTRACTION_RULES = `Tu esi VAUTO Smart Assistant — PASS 1 STRICT EXTRACTION. Grąžink TIK vieną JSON faktų objektą (be sales copy).

PAIEŠKOS IZOLIACIJA (kai intent=search): keyword/kategorija TIK iš dabartinės užklausos — NIEKADA nejunk ankstesnių nesusijusių temų.

${VAUTO_DOMAIN_AUTONOMY_RULES}

${VISION_REGITRA_TECH_PASSPORT_OCR_RULE}

${VISION_DEEP_OCR_EXTRACTION_RULE}

OCR + FAKTAI → technicalFields (AUTO-FILL PrePublish BE follow-up klausimų):
- Tech passport / dokumentai / pakuotės tekstas: imageRoles=document kai tai specifikacijų šaltinis; documentImageIndexes = PRIMARY ground-truth.
- HARD SPECS (Regitra): A→plate/licensePlate, B→firstRegistration YYYY-MM-DD (+ year), D.1→make, D.3→model VERBATIM, S.1→seats, P.1→engine (cm³→litrai), P.2→powerKw, P.3→fuelType, R→color, V.9→euroStandard, G→curbWeight, C.1.3→city, E→vin.
- PAKUOTĖS OCR (PEIKO ir pan.): brand, model, specs, languages, battery, contents → technicalFields + factNotes/ocrText (VISAS įskaitomas tekstas).
- VISUAL EXTRAS (tik kai category=AUTOMOBILIAI): interiorCondition, exteriorFeatures, transmission.
- MODEL FIDELITY: model EXACT D.3 — „Grand C4 Picasso“ ≠ „C4 Picasso“.
- Jei dalinai neryšku: documentReadable=false + documentOcrConfidence, BET VIS TIEK grąžink matomus laukus.
- galleryImageIndexes / imageRoles=gallery — TIK produkto nuotraukos. Žalias/mėlynas tech passport VISADA document.
- Jei faktas nematomas — praleisk. Kainos / ridos / TA / miesto NEGALIMA išgalvoti.
- Šiame žingsnyje NErašyk title/description sales copy — tik šalti faktai.

${TEXT_AND_VISION_INPUT_ONLY}

${STRUCTURED_INPUT_VISION_RULES}

KATEGORIJOS PASIRINKIMAS (tik label — copy rašoma Pass 2):
- AUTOMOBILIAI: tikras auto/motociklas (VIN, tech passport, markė+modelis).
- MUZIKA: gitara, pianinas, būgnai, smuikas, ukulelė, sintezatorius…
- NT: butas/namas/sklypas (NE „NAMAI“).
- MENAS / LAISVALAIKIS / SPORTAS / ELEKTRONIKA / APRANGA / NAMAI — pagal vizualą.
- PASLAUGOS / DARBAS — paslaugų ar darbo skelbimai.
- Jei keli PARDUODAMI objektai — detectedObjects + choiceChips.
- Dokumentai NIEKADA nėra detectedObjects / choiceChips.

${buildHandbookExtractionFewShots()}`;

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
  MUZIKA: "other",
  LAISVALAIKIS: "other",
  MENAS: "home",
};

const INSTRUMENT_CONTENT_RE =
  /\b(gitar|guitar|hohner|muzik|pianin|būgn|bugn|drum|smuik|akustin|bosin|ukulel|sintezator|mušam)/i;

function remapCategoryFromContent(
  internalCategory: string,
  categoryKey: string,
  title: string,
  description: string,
  technicalFields: Record<string, string | string[]>
): { category: string; vautoCategory: string } {
  const blob = [
    title,
    description,
    String(technicalFields.brand ?? ""),
    String(technicalFields.make ?? ""),
    String(technicalFields.model ?? ""),
    String(technicalFields.instrumentType ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  if (INSTRUMENT_CONTENT_RE.test(blob)) {
    return { category: "other", vautoCategory: "MUZIKA" };
  }

  if (
    /\b(paveiksl|skulptūr|tapyt|rankų\s+darb|abstrakt|drob[eė])/i.test(blob) &&
    internalCategory !== "vehicles"
  ) {
    return { category: "home", vautoCategory: "MENAS" };
  }

  // Never keep vehicles when there are no hard auto signals and content is general goods.
  if (internalCategory === "vehicles") {
    const hardAuto =
      Boolean(technicalFields.mileage) ||
      Boolean(technicalFields.vin) ||
      Boolean(technicalFields.fuelType) ||
      Boolean(technicalFields.licensePlate) ||
      Boolean(technicalFields.plate) ||
      Boolean(technicalFields.powerKw) ||
      Boolean(technicalFields.bodyType);
    if (!hardAuto && /\b(gitara|paveiksl|drabuž|batai|telefon|ausin)/i.test(blob)) {
      return { category: "other", vautoCategory: categoryKey || "LAISVALAIKIS" };
    }
  }

  return {
    category: internalCategory,
    vautoCategory: categoryKey || "NAMAI",
  };
}

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
    if (liters > 0.5 && liters < 10) {
      out.engine = String(liters);
      out.engineCc = cm3[1]!;
    }
  }
  if (out.fuelType) out.fuelType = normalizeFuelType(String(out.fuelType));
  if (out.vin) {
    const vin = normalizeVin(String(out.vin));
    if (vin) out.vin = vin;
  }
  if (out.powerKw) out.powerKw = normalizePowerKw(String(out.powerKw));
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
  const categoryKey = String(raw.category ?? "").toUpperCase().trim();
  const mappedInternal = CATEGORY_TO_INTERNAL[categoryKey];
  // Prefer explicit taxonomy; only fall back to NAMAI/home-adjacent "other" when unknown —
  // never force AUTOMOBILIAI. Unknown LLM labels → other + keep raw key for UI tags.
  const baseInternal = mappedInternal ?? "other";
  const priceRaw = raw.price;
  const price =
    priceRaw === null || priceRaw === undefined ? 0 : Number(priceRaw) || 0;

  const technicalFields = parseTechnicalFields(raw.technicalFields ?? raw.attributes);
  const title = String(raw.title ?? "Skelbimas");
  const description = raw.description ? String(raw.description) : "";
  const remapped = remapCategoryFromContent(
    baseInternal,
    categoryKey || (baseInternal === "other" ? "LAISVALAIKIS" : categoryKey),
    title,
    description,
    technicalFields
  );
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
  const publicCategoryTag =
    remapped.vautoCategory === "MUZIKA"
      ? "Muzika / Instrumentai"
      : remapped.vautoCategory === "LAISVALAIKIS"
        ? "Laisvalaikis"
        : remapped.vautoCategory === "MENAS"
          ? "Menas"
          : remapped.vautoCategory === "SPORTAS"
            ? "Sportas"
            : undefined;

  return {
    title,
    price,
    location: resolveListingCity(
      String(raw.city ?? raw.location ?? ""),
      userCityResolved
    ),
    contact,
    category: remapped.category,
    description: description || undefined,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.85)),
    attributes: {
      ...technicalFields,
      _intent: String(raw.intent ?? "sell"),
      _vautoCategory: remapped.vautoCategory,
      ...(publicCategoryTag ? { skelbiuCategory: publicCategoryTag } : {}),
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

function buildExtractionTextPrompt(
  text: string,
  userCity: string,
  extraContext?: string
): string {
  const extra = extraContext?.trim()
    ? `\nPapildomas kontekstas: ${extraContext.trim()}`
    : "";
  return `${EXTRACTION_RULES}

PASS 1 — STRICT EXTRACTION (šalti faktai → JSON).
Sek Employee Handbook few-shot etalonus (PEIKO pakuotė, Regitra, Hohner, NT, paslaugos, darbas).
Vartotojo tekstas: """${text}"""${extra}
Numatytas miestas jei nepaminėtas: ${userCity}
Pavyzdžiai:
- „Parduodu citroena" → intent sell, category AUTOMOBILIAI, technicalFields.make Citroën.
- „Parduodu gitarą Hohner" → intent sell, category MUZIKA, technicalFields.brand Hohner.
- „Parduodu PEIKO vertėją" → ELEKTRONIKA + brand/model/specs iš teksto/OCR.
Grąžink JSON: ${EXTRACTION_SCHEMA}`;
}

function buildExtractionImagePrompt(
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
  return `${EXTRACTION_RULES}
${VISION_EXTRACTION_ANTI_HALLUCINATION_RULE}

PASS 1 — STRICT EXTRACTION iš nuotraukų (šalti faktai; BE sales copy).
DEEP OCR: nuskaityk VISĄ įskaitomą tekstą ant dėžučių, etikečių, galinių dangtelių ir Regitra paso.
Analizuok VISAS nuotraukas eilės tvarka (indeksai 0..n-1). Document / specs nuotraukos = PRIMARY OCR.
1) PRIVALOMA imageRoles (gallery|document). Žalias/mėlynas tech passport / registracija / kvitas — VISADA document.
2) documentImageIndexes + galleryImageIndexes sutampa su imageRoles.
3) HARD SPECS — Regitra techninis pasas → technicalFields AUTO-FILL PrePublish BE papildomų klausimų:
   A→plate/licensePlate · B→firstRegistration YYYY-MM-DD + year · D.1→make · D.3→model VERBATIM
   S.1→seats · E→vin · P.1→engine litrais · P.2→powerKw · P.3→fuelType · R→color · V.9→euroStandard · G→curbWeight · C.1.3→city
4) PAKUOTĖS OCR (PEIKO ir pan.): brand/model/specs/languages/battery/contents → technicalFields + factNotes + ocrText.
5) VISUAL EXTRAS (tik AUTOMOBILIAI gallery): interiorCondition, exteriorFeatures, transmission, bodyType.
6) NIEKADA neklausti markės/modelio/variklio/kuro/VIN/brand, jei jau ištraukti — forma užpildoma iš karto.
7) Šiame žingsnyje NErašyk turtingo description — tik faktų JSON.${textNote}${extra}
Numatytas miestas: ${userCity}
Grąžink JSON: ${EXTRACTION_SCHEMA}`;
}

function buildCreativeWritePrompt(
  extracted: Record<string, unknown>,
  userCity: string
): string {
  const category = String(extracted.category ?? "NAMAI");
  const { id: prompterId, prompt: categoryPrompt } = getCategoryPrompter(category);
  const facts = {
    intent: extracted.intent ?? "sell",
    category,
    price: extracted.price ?? null,
    city: extracted.city || userCity,
    technicalFields: extracted.technicalFields ?? {},
    sceneContext: extracted.sceneContext ?? "",
    factNotes: extracted.factNotes ?? "",
    ocrText: extracted.ocrText ?? "",
    confidence: extracted.confidence ?? 0.85,
  };
  return `Tu esi VAUTO MASTER SALES COPYWRITER — PASS 2 CREATIVE WRITE (FACT-GROUNDED).
Rašyk turtingą, engaginantį, gerai struktūruotą pardavimo tekstą NATŪRALIA lietuvių kalba.
PRIVALOMA: description KURK TIESIOGIAI iš žemiau esančio Pass 1 JSON + OCR faktų — be bendrybių ir be išgalvotų specs.
Kiekvieną perskaitytą specs detalę (dėžutė / Regitra / technicalFields / factNotes / ocrText) įtrauk į **Specifikacijos ir Savybės** bullet'us.
Pozityvus framing: rašyk ką PASAKYTI (hook, privalumai, būklė, specs, CTA).
Kategorijos izoliacija jau užtikrinta prompteriu (${prompterId}).
Sek Employee Handbook gold-standard few-shot struktūrą (žemiau + prompteryje).

${categoryPrompt}

IŠTRAUKTI FAKTAI (ground-truth JSON — VIENINTELIS šaltinis):
${JSON.stringify(facts, null, 2)}

Numatytas miestas: ${userCity}
Grąžink TIK JSON: ${CREATIVE_SCHEMA}`;
}

/**
 * Two-pass pipeline:
 * 1) Strict structured extraction (facts / OCR / category)
 * 2) Category-routed creative Lithuanian sales copy
 */
async function runTwoPassListingGeneration(opts: {
  mode: "text" | "image";
  text?: string;
  userCity: string;
  extraContext?: string;
  imageDataUrls?: string[];
  priceHint?: number;
}): Promise<Record<string, unknown>> {
  const city = opts.userCity;
  const extractionPrompt =
    opts.mode === "image"
      ? buildExtractionImagePrompt(city, opts.text, opts.extraContext)
      : buildExtractionTextPrompt(opts.text ?? "", city, opts.extraContext);

  const extractedRaw = await unifiedLlmJson({
    prompt: extractionPrompt,
    ...(opts.mode === "image" && opts.imageDataUrls?.length
      ? { imageDataUrls: opts.imageDataUrls }
      : {}),
    userTextFallback: opts.text?.trim() || undefined,
    userCityFallback: city,
    priceHint: opts.priceHint,
  });

  const extracted = opts.text?.trim()
    ? enrichSellerListingFromText(opts.text.trim(), extractedRaw)
    : extractedRaw;

  // Heuristic category remap before creative write — keeps prompter isolation tight.
  const technicalFields = parseTechnicalFields(
    extracted.technicalFields ?? extracted.attributes
  );
  const remapped = remapCategoryFromContent(
    CATEGORY_TO_INTERNAL[String(extracted.category ?? "").toUpperCase()] ?? "other",
    String(extracted.category ?? "").toUpperCase(),
    String(extracted.title ?? ""),
    String(extracted.factNotes ?? ""),
    technicalFields
  );
  extracted.category = remapped.vautoCategory;
  extracted.technicalFields = technicalFields;

  let creative: Record<string, unknown> = {};
  try {
    creative = await unifiedLlmJson({
      prompt: buildCreativeWritePrompt(extracted, city),
      userTextFallback: opts.text?.trim() || undefined,
      userCityFallback: city,
      priceHint: opts.priceHint,
    });
  } catch (err) {
    console.warn(
      "[vauto-unified] Pass-2 creative write failed — falling back to factNotes/title stub",
      err instanceof Error ? err.message : err
    );
  }

  const title =
    String(creative.title ?? "").trim() ||
    buildFallbackTitle(remapped.vautoCategory, technicalFields, opts.text);
  const description =
    String(creative.description ?? "").trim() ||
    String(extracted.factNotes ?? "").trim() ||
    title;

  return {
    ...extracted,
    category: remapped.vautoCategory,
    title,
    description,
    technicalFields,
  };
}

function buildFallbackTitle(
  category: string,
  fields: Record<string, string | string[]>,
  userText?: string
): string {
  const make = String(fields.make ?? fields.brand ?? "").trim();
  const model = String(fields.model ?? "").trim();
  const year = String(fields.year ?? "").trim();
  if (category === "AUTOMOBILIAI" && (make || model)) {
    return [make, model, year].filter(Boolean).join(" ").trim();
  }
  const fromUser = userText?.trim().replace(/^parduodu\s+/i, "").slice(0, 80);
  return fromUser || "Skelbimas";
}

/** @deprecated Use extraction + creative two-pass helpers. Kept for log compatibility. */
function buildImagePrompt(
  userCity: string,
  text?: string,
  extraContext?: string
): string {
  return buildExtractionImagePrompt(userCity, text, extraContext);
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
    const raw = await runTwoPassListingGeneration({
      mode: "text",
      text,
      userCity: city,
      extraContext: body.extraContext,
    });
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
    const raw = await runTwoPassListingGeneration({
      mode: "image",
      text: combinedText || undefined,
      userCity: city,
      extraContext: body.extraContext,
      imageDataUrls: visionImages,
    });
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
  const extractionPrompt = buildExtractionImagePrompt(
    city,
    params.text,
    params.extraContext
  );
  console.log("[vision] parseListingImagesForAgent two-pass", {
    promptChars: extractionPrompt.length,
    promptHead: extractionPrompt.slice(0, 280),
    categoryRouter: true,
  });
  let raw: Record<string, unknown>;
  try {
    raw = await runTwoPassListingGeneration({
      mode: "image",
      text: combinedText || undefined,
      userCity: city,
      extraContext: params.extraContext,
      imageDataUrls: images,
      priceHint: params.priceHint,
    });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    // Flat string — Render truncates console.error object payloads.
    console.error(
      `[vision] parseListingImagesForAgent two-pass error ${JSON.stringify({
        errMessage,
        stack: err instanceof Error ? err.stack?.slice(0, 700) : undefined,
      })}`
    );
    throw err;
  }
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
