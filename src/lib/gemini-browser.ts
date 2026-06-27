/**

 * Browser-direct Gemini calls — bypasses Render IP blocks.

 * Restrict the API key to HTTP referrers (vauto-chi.vercel.app, localhost) in Google Cloud.

 */



import { resolveListingCity } from "@/lib/city-resolve";
import { SPINTA_SEARCH_SYSTEM_RULE } from "@/lib/wardrobe-cabinet-mode";

import type { AiExtractedListing, ListingCategory } from "@/lib/types";



const GEMINI_VISION_MODELS = [

  "gemini-1.5-flash",

  "gemini-1.5-flash-latest",

  "gemini-2.5-flash",

] as const;



const GEMINI_TEXT_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"] as const;



const DEFAULT_JSON_SYSTEM =

  "Grąžink tik vieną galiojantį JSON objektą. Jokio markdown, jokių paaiškinimų.";



export const VAUTO_VISION_MULTIMODAL_PROMPT =

  "Tu esi VAUTO skelbimų asistentas. Analizuok vartotojo tekstą ar nuotrauką, identifikuok objektą ir priskirk kategoriją. NT (nekilnojamasis turtas): butas, namas, žemė, sklypas, sodyba, kotedžas, patalpos — kategorija NT, NE Namai. Automobiliai: auto, automobilis, mašina — kategorija Auto net be markės. Antraštę sugeneruok patrauklią (pvz. „Parduodamas butas“), NIEKADA „Universalus daiktas“. Kategorijos: Auto, Elektronika, Namai (buitinės prekės), Drabužiai, Paslaugos, NT, Darbas.";



export type GeminiContentPart =

  | { text: string }

  | {

      inlineData: {

        data: string;

        mimeType: string;

      };

    };



const LISTING_SCHEMA = `{

  "intent": "sell | search | service | general",

  "category": "Auto | Elektronika | Namai | Drabužiai | Paslaugos | NT | Darbas",

  "title": "string — patrauklus lietuviškas skelbimo pavadinimas",

  "price": "number | null — kaina EUR; null jei nenurodyta",

  "city": "string — tikras Lietuvos miestas (Vilnius, Kaunas, …)",

  "description": "string — pilnas profesionalus skelbimo aprašymas lietuviškai",

  "technicalFields": "object — kategorijai būdingi laukai (markė, modelis, būklė, dydis ir pan.)",

  "confidence": "number 0-1"

}`;



const LISTING_SYSTEM = `${VAUTO_VISION_MULTIMODAL_PROMPT}

Visada grąžink TIK vieną JSON objektą pagal schemą — jokio markdown.
Aprašymą sugeneruok išsamiai lietuviškai.
KATEGORIJOS: „parduodu butą/namą/žemę/sklypą“ → NT. „parduodu auto/automobili/mašiną“ → Auto (net be markės).
ANTRAŠTĖ: patraukli pardavimo antraštė lietuviškai. Draudžiama: „Universalus daiktas“, „Prekė“, bendri placeholderiai.`;



const CATEGORY_TO_INTERNAL: Record<string, ListingCategory> = {

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



const USER_CATEGORY_TO_INTERNAL: Record<string, ListingCategory> = {

  Auto: "vehicles",

  Elektronika: "electronics",

  Namai: "home",

  Drabužiai: "clothing",

  Paslaugos: "services",

  NT: "real_estate",

  Darbas: "jobs",

};



const VALID_LISTING_CATEGORIES = new Set(Object.keys(CATEGORY_TO_INTERNAL));



export type ClientSearchCategoryLabel =

  | "Auto"

  | "Elektronika"

  | "Namai"

  | "Drabužiai"

  | "Paslaugos"

  | "NT"

  | "Darbas"

  | null;



export interface ClientSearchIntent {

  category: ClientSearchCategoryLabel;

  cleanQuery: string;

  location: string;

  radiusKm: number | null;

  condition: "used" | "new" | null;

}



const SEARCH_INTENT_SCHEMA = `{

  "category": "Auto | Elektronika | Namai | Drabužiai | Paslaugos | NT | Darbas | null",

  "cleanQuery": "string — produkto ar paslaugos pavadinimas lietuviškai, be klausiamųjų žodžių (kas, kur, rask)",

  "location": "string — Lietuvos miestas vardininku (Vilnius, Kaunas, …) arba tuščia eilutė",

  "radiusKm": "number | null — tik 5, 10, 20, 50 arba null",

  "condition": "used | new | null"

}`;



const SEARCH_CATEGORIES = new Set([

  "Auto",

  "Elektronika",

  "Namai",

  "Drabužiai",

  "Paslaugos",

  "NT",

  "Darbas",

]);



export function getClientGeminiApiKey(): string | null {

  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();

  return key || null;

}



export function isClientGeminiAvailable(): boolean {

  return typeof window !== "undefined" && Boolean(getClientGeminiApiKey());

}



function parseJsonFromText(text: string): Record<string, unknown> {

  const trimmed = text.trim();

  try {

    return JSON.parse(trimmed) as Record<string, unknown>;

  } catch {

    /* fall through */

  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fence) return JSON.parse(fence[1].trim()) as Record<string, unknown>;

  const start = trimmed.indexOf("{");

  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {

    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;

  }

  throw new Error("Could not parse JSON from Gemini response");

}



function snapSearchRadius(km: unknown): number | null {

  const n = Number(km);

  if (!Number.isFinite(n) || n <= 0) return null;

  if (n <= 5) return 5;

  if (n <= 10) return 10;

  if (n <= 20) return 20;

  return 50;

}



/** Strip data-URL prefix — Gemini expects raw Base64 only (split(',')[1]). */

export function extractInlineDataFromDataUrl(

  dataUrl: string,

  fallbackMimeType = "image/jpeg"

): { data: string; mimeType: string } | null {

  const trimmed = dataUrl.trim();

  if (!trimmed) return null;



  if (trimmed.includes(",")) {

    const commaIdx = trimmed.indexOf(",");

    const header = trimmed.slice(0, commaIdx);

    const base64Data = trimmed.slice(commaIdx + 1).replace(/\s/g, "");

    if (!base64Data || base64Data.length < 16) return null;

    const mimeMatch = header.match(/^data:([^;,]+)/i);

    const mimeType = (mimeMatch?.[1] || fallbackMimeType).trim();

    return { data: base64Data, mimeType };

  }



  const cleaned = trimmed.replace(/\s/g, "");

  if (/^[A-Za-z0-9+/]+=*$/.test(cleaned) && cleaned.length >= 16) {

    return { data: cleaned, mimeType: fallbackMimeType };

  }



  return null;

}



/** Convert Blob/File to data URL via FileReader (required before Gemini upload). */

export function readBlobAsDataUrl(blob: Blob): Promise<string> {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => {

      if (typeof reader.result === "string") resolve(reader.result);

      else reject(new Error("FileReader returned non-string"));

    };

    reader.onerror = () =>

      reject(reader.error ?? new Error("FileReader failed to read image"));

    reader.readAsDataURL(blob);

  });

}



/** FileReader → inlineData per Google spec (pure base64 + mimeType). */

export function readFileAsInlinePart(file: File): Promise<GeminiContentPart> {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => {

      if (typeof reader.result !== "string") {

        reject(new Error("FileReader returned non-string"));

        return;

      }

      const base64Data = reader.result.split(",")[1]?.replace(/\s/g, "");

      if (!base64Data) {

        reject(new Error("Nepavyko nuskaityti nuotraukos Base64"));

        return;

      }

      resolve({

        inlineData: {

          data: base64Data,

          mimeType: file.type || "image/jpeg",

        },

      });

    };

    reader.onerror = () =>

      reject(reader.error ?? new Error("FileReader failed to read image"));

    reader.readAsDataURL(file);

  });

}



export function dataUrlToInlinePart(dataUrl: string): GeminiContentPart | null {

  const parsed = extractInlineDataFromDataUrl(dataUrl);

  if (!parsed) return null;



  return {

    inlineData: {

      data: parsed.data,

      mimeType: parsed.mimeType,

    },

  };

}



export async function imageInputToInlinePart(

  input: string | Blob | File

): Promise<GeminiContentPart> {

  if (input instanceof File) {

    return readFileAsInlinePart(input);

  }



  const dataUrl =

    typeof input === "string" ? input : await readBlobAsDataUrl(input);

  const part = dataUrlToInlinePart(dataUrl);

  if (!part) {

    throw new Error("Nepavyko konvertuoti nuotraukos į Base64");

  }

  return part;

}



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



function resolveListingCategory(raw: unknown): ListingCategory {

  const label = String(raw ?? "").trim();

  if (USER_CATEGORY_TO_INTERNAL[label]) return USER_CATEGORY_TO_INTERNAL[label];



  for (const [key, cat] of Object.entries(USER_CATEGORY_TO_INTERNAL)) {

    if (key.toLowerCase() === label.toLowerCase()) return cat;

  }



  const upper = label.toUpperCase();

  if (VALID_LISTING_CATEGORIES.has(upper)) return CATEGORY_TO_INTERNAL[upper]!;



  return "other";

}



function mapRawListingJson(

  raw: Record<string, unknown>,

  userCity: string,

  contact: string

): AiExtractedListing {

  const categoryKey = String(raw.category ?? "Namai").trim();

  const internalCategory = resolveListingCategory(categoryKey);



  const priceRaw = raw.price;

  const price =

    priceRaw === null || priceRaw === undefined ? 0 : Number(priceRaw) || 0;



  const technicalFields = parseTechnicalFields(

    raw.technicalFields ?? raw.attributes

  );

  const userCityResolved = resolveListingCity(userCity, "Vilnius");



  return {

    title: String(raw.title ?? "Skelbimas").trim(),

    price,

    location: resolveListingCity(String(raw.city ?? raw.location ?? ""), userCityResolved),

    contact,

    category: internalCategory,

    description: raw.description ? String(raw.description) : undefined,

    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.85)),

    attributes: {

      ...technicalFields,

      _intent: String(raw.intent ?? "sell"),

      _vautoCategory: categoryKey,

    },

  };

}



function buildListingImagePrompt(

  userCity: string,

  text?: string,

  extraContext?: string

): string {

  const textNote = text?.trim()

    ? `\nVartotojo papildomas aprašymas: """${text.trim()}"""`

    : "";

  const extra = extraContext?.trim()

    ? `\nKontekstas: ${extraContext.trim()}`

    : "";



  return `${VAUTO_VISION_MULTIMODAL_PROMPT}



${textNote}${extra}

Numatytas miestas: ${userCity}

Grąžink JSON: ${LISTING_SCHEMA}`;

}



async function geminiGenerateJsonWithModels(

  apiKey: string,

  models: readonly string[],

  systemInstruction: string,

  userParts: GeminiContentPart[],

  generationConfig?: Record<string, unknown>

): Promise<Record<string, unknown>> {

  let lastError: unknown;



  for (const model of models) {

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const res = await fetch(url, {

      method: "POST",

      headers: {

        "Content-Type": "application/json",

        "x-goog-api-key": apiKey,

      },

      body: JSON.stringify({

        systemInstruction: { parts: [{ text: systemInstruction }] },

        contents: [{ role: "user", parts: userParts }],

        generationConfig: { temperature: 0.2, ...generationConfig },

      }),

    });



    if (!res.ok) {

      const errBody = await res.text();

      console.warn(`[gemini-browser] ${model} failed (${res.status}):`, errBody.slice(0, 400));

      lastError = new Error(`Gemini ${model} ${res.status}: ${errBody}`);

      continue;

    }



    const data = (await res.json()) as {

      candidates?: { content?: { parts?: { text?: string }[] } }[];

    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {

      lastError = new Error("Empty Gemini response");

      continue;

    }



    return parseJsonFromText(text);

  }



  throw lastError instanceof Error ? lastError : new Error("Gemini API nepavyko");

}



async function geminiGenerateVisionJson(

  apiKey: string,

  systemInstruction: string,

  userParts: GeminiContentPart[]

): Promise<Record<string, unknown>> {

  return geminiGenerateJsonWithModels(

    apiKey,

    GEMINI_VISION_MODELS,

    systemInstruction,

    userParts,

    { responseMimeType: "application/json" }

  );

}



async function geminiChatJson(

  apiKey: string,

  systemInstruction: string,

  userPrompt: string

): Promise<Record<string, unknown>> {

  return geminiGenerateJsonWithModels(

    apiKey,

    GEMINI_TEXT_MODELS,

    systemInstruction,

    [{ text: userPrompt }]

  );

}



/** Multimodal listing extraction — image(s) + prompt, browser-direct Gemini. */

export async function clientExtractListingFromImage(input: {

  imageDataUrl?: string | null;

  imageDataUrls?: string[];

  extraContext?: string;

  transcript?: string;

  userCity?: string;

  contact?: string;

}): Promise<AiExtractedListing> {

  const apiKey = getClientGeminiApiKey();

  if (!apiKey) {

    throw new Error("NEXT_PUBLIC_GEMINI_API_KEY not configured");

  }



  const urls =

    input.imageDataUrls?.filter(Boolean).length

      ? input.imageDataUrls!.filter(Boolean)

      : input.imageDataUrl

        ? [input.imageDataUrl]

        : [];



  if (!urls.length) {

    throw new Error("imageDataUrl is required for vision extraction");

  }



  const inlineParts: GeminiContentPart[] = [];

  for (const url of urls) {

    const part = dataUrlToInlinePart(url);

    if (part) inlineParts.push(part);

  }



  if (!inlineParts.length) {

    throw new Error("Nuotraukos Base64 konversija nepavyko — neteisingas data URL");

  }



  if (process.env.NODE_ENV !== "production") {

    const sample = inlineParts[0];

    if ("inlineData" in sample) {

      console.info("[gemini-browser] vision payload", {

        mimeType: sample.inlineData.mimeType,

        base64Length: sample.inlineData.data.length,

        imageCount: inlineParts.length,

        model: GEMINI_VISION_MODELS[0],

      });

    }

  }



  const city = resolveListingCity(input.userCity?.trim(), "Vilnius");

  const contact = input.contact?.trim() || "+370 612 34567";

  const prompt = buildListingImagePrompt(city, input.transcript, input.extraContext);



  const raw = await geminiGenerateVisionJson(

    apiKey,

    `${LISTING_SYSTEM}\n\n${DEFAULT_JSON_SYSTEM}`,

    [{ text: prompt }, ...inlineParts]

  );



  return mapRawListingJson(raw, city, contact);

}



/** Combined voice/text + image listing extraction via browser Gemini. */

export async function clientExtractListingCombined(input: {

  imageDataUrl?: string | null;

  imageDataUrls?: string[];

  transcript?: string;

  extraContext?: string;

  userCity?: string;

  contact?: string;

}): Promise<AiExtractedListing> {

  return clientExtractListingFromImage(input);

}



/** Structured buyer search intent — called from the user's browser (not Render). */

export async function clientAnalyzeSearchIntent(input: {

  query: string;

  userCity?: string;

  wardrobeOnly?: boolean;

}): Promise<ClientSearchIntent> {

  const apiKey = getClientGeminiApiKey();

  if (!apiKey) {

    throw new Error("NEXT_PUBLIC_GEMINI_API_KEY not configured");

  }



  const query = input.query.trim();

  const systemInstruction = `Esi VAUTO pirkėjo paieškos intent analizatorius. Semantiškai suprask lietuvių kalbą.

Vartotojas IEŠKO skelbimų — nekelia skelbimo.
${input.wardrobeOnly ? SPINTA_SEARCH_SYSTEM_RULE : ""}

Grąžink tik JSON pagal schemą: ${SEARCH_INTENT_SCHEMA}`;



  const userPrompt = `Užklausa: "${query}"

Numatytas vartotojo miestas: ${input.userCity ?? "Lietuva"}`;



  const raw = await geminiChatJson(apiKey, systemInstruction, userPrompt);



  const categoryRaw = raw.category;

  const category =

    categoryRaw == null || categoryRaw === "null"

      ? null

      : SEARCH_CATEGORIES.has(String(categoryRaw))

        ? (String(categoryRaw) as Exclude<ClientSearchCategoryLabel, null>)

        : null;



  return {

    category: input.wardrobeOnly ? "Drabužiai" : category,

    cleanQuery: String(raw.cleanQuery ?? "").trim(),

    location: String(raw.location ?? "").trim(),

    radiusKm: snapSearchRadius(raw.radiusKm),

    condition:

      raw.condition === "used" || raw.condition === "new" ? raw.condition : null,

  };

}

const VISUAL_SEARCH_INTENT_SCHEMA = `{
  "objectType": "vehicle | real_estate | electronics | clothing | home | services | other",
  "category": "Auto | Elektronika | Namai | Drabužiai | Paslaugos | NT | Darbas | null",
  "cleanQuery": "string — lietuviškas paieškos tekstas (markė, modelis, spalva, tipas)",
  "location": "string — Lietuvos miestas vardininku arba tuščia",
  "radiusKm": "number | null — tik 5, 10, 20, 50 arba null",
  "condition": "used | new | null",
  "confidence": "number 0-1",
  "visualSummary": "string — 1 sakinys, ką matai nuotraukoje",
  "searchFilters": {
    "make": "string | null",
    "model": "string | null",
    "bodyType": "string | null",
    "color": "string | null",
    "fuelType": "string | null",
    "propertyType": "string | null",
    "rooms": "string | null",
    "furnishing": "string | null",
    "transactionType": "string | null",
    "brand": "string | null",
    "size": "string | null",
    "clothingType": "string | null"
  }
}`;

/** Gemini Vision buyer search — nuotrauka → struktūrizuoti filtrai (browser-direct). */
export async function clientAnalyzeVisualSearchIntent(input: {
  imageDataUrl: string;
  extraContext?: string;
  userCity?: string;
  wardrobeOnly?: boolean;
}): Promise<Record<string, unknown>> {
  const apiKey = getClientGeminiApiKey();
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GEMINI_API_KEY not configured");
  }

  const part = dataUrlToInlinePart(input.imageDataUrl);
  if (!part) {
    throw new Error("Nuotraukos Base64 konversija nepavyko");
  }

  const contextNote = input.extraContext?.trim()
    ? ` Papildomas vartotojo tekstas: ${input.extraContext.trim()}`
    : "";

  const systemInstruction = `Esi VAUTO pirkėjo VISUAL paieškos intent analizatorius su Gemini Vision.
Vartotojas IEŠKO panašių skelbimų pagal nuotrauką — NEKELIA skelbimo.
Identifikuok objekto tipą, markę, modelį, kėbulo tipą, spalvą, NT pobūdį, kambarius, aplinką.
Konvertuok tai į searchFilters ir cleanQuery lietuviškai.
${input.wardrobeOnly ? SPINTA_SEARCH_SYSTEM_RULE : ""}
Grąžink tik JSON: ${VISUAL_SEARCH_INTENT_SCHEMA}`;

  const userPrompt = `Analizuok paieškos nuotrauką ir suformuok filtrus.
Numatytas vartotojo miestas: ${input.userCity ?? "Lietuva"}.${contextNote}`;

  return geminiGenerateJsonWithModels(
    apiKey,
    GEMINI_VISION_MODELS,
    systemInstruction,
    [{ text: userPrompt }, part]
  );
}



const URL_IMPORT_SCHEMA = `{

  "intent": "sell",

  "category": "Auto | NT | Drabužiai | Darbas | Elektronika | Namai | Paslaugos",

  "title": "string — lietuviškas skelbimo pavadinimas",

  "price": "number | null",

  "priceLabel": "string | null — pvz. 2500 EUR brutto / mėn.",

  "city": "string — Lietuvos miestas arba Lietuva",

  "description": "string — pilnas aprašymas lietuviškai",

  "confidence": "number 0-1",

  "attributes": {

    "vehicles": "make, model, year, mileage, fuelType, gearbox, bodyType, driveType, defects, vehicleOptions",

    "real_estate": "propertyType, transactionType, area, rooms, heating, landUtilities, ntFeatures, furnishing",

    "clothing": "fashionCategory, clothingType, brand, size, condition, colors, shipping",

    "jobs": "jobType, employmentType, locationType, experienceRequired, salaryGross, salaryNet, jobTitle",

    "other": "skelbiuCategory, manufacturer, deviceModel, condition"

  }

}`;



const URL_IMPORT_SYSTEM = `Tu esi VAUTO skelbimų importo asistentas. Iš portalų (Autoplius, Aruodas, Vinted, Skelbiu, CVBankas) HTML teksto ar URL struktūros ištrauk skelbimo duomenis.

VAUTO veikia visoje Lietuvoje — location/city turi būti tikras LT miestas arba „Lietuva“, ne regioninis apribojimas.

Grąžink TIK JSON pagal schemą. attributes — plokščias objektas su kategorijai būdingais laukais (ne nested).

Auto: year, mileage, bodyType, fuelType, gearbox, driveType, vehicleOptions (masyvas).

NT: propertyType (butas/namas/sklypas), transactionType (Pardavimui/Nuomai), area, rooms, heating, landUtilities, ntFeatures.

Drabužiai: size, condition, colors, brand, fashionCategory, shipping.

Darbas: jobTitle, employmentType, locationType, experienceRequired, salaryGross, salaryNet (jei matoma).

${DEFAULT_JSON_SYSTEM}`;



/** Import listing from external portal page text or URL via browser Gemini. */

export async function clientExtractListingFromPageText(input: {

  url: string;

  portal: string;

  pageText?: string;

  userCity?: string;

  contact?: string;

}): Promise<AiExtractedListing> {

  const apiKey = getClientGeminiApiKey();

  if (!apiKey) {

    throw new Error("NEXT_PUBLIC_GEMINI_API_KEY not configured");

  }



  const city = resolveListingCity(input.userCity?.trim(), "Lietuva");

  const contact = input.contact?.trim() || "+370 612 34567";

  const textSlice = (input.pageText?.trim() || "").slice(0, 12000);



  const userPrompt = `Portalas: ${input.portal}

Nuoroda: ${input.url}

${textSlice ? `Puslapio tekstas (HTML→text):\n"""${textSlice}"""` : "Puslapio teksto nėra — ištrauk kiek galima iš URL kelio ir portalo konteksto."}

Numatytas miestas: ${city}

Grąžink JSON: ${URL_IMPORT_SCHEMA}`;



  const raw = await geminiChatJson(

    apiKey,

    URL_IMPORT_SYSTEM,

    userPrompt

  );



  const mapped = mapRawListingJson(raw, city, contact);

  mapped.attributes = {

    ...(mapped.attributes ?? {}),

    _importSource: input.portal,

    _importUrl: input.url,

  };

  return mapped;

}


