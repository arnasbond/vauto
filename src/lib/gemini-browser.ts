/**
 * Browser-direct Gemini calls — bypasses Render IP blocks.
 * Restrict the API key to HTTP referrers (vauto-chi.vercel.app, localhost) in Google Cloud.
 */

import { resolveListingCity } from "@/lib/city-resolve";
import type { AiExtractedListing, ListingCategory } from "@/lib/types";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

const DEFAULT_JSON_SYSTEM =
  "Grąžink tik vieną galiojantį JSON objektą. Jokio markdown, jokių paaiškinimų.";

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
  "category": "AUTOMOBILIAI | NT | ELEKTRONIKA | DARBAS | NAMAI | SPORTAS | APRANGA | PASLAUGOS | VAIKAMS | GYVUNAI",
  "title": "string — patrauklus lietuviškas skelbimo pavadinimas",
  "price": "number | null — kaina EUR; null jei nenurodyta",
  "city": "string — tikras Lietuvos miestas (Vilnius, Kaunas, …)",
  "description": "string — pilnas profesionalus skelbimo aprašymas lietuviškai",
  "technicalFields": "object — kategorijai būdingi laukai (markė, modelis, būklė, dydis ir pan.)",
  "confidence": "number 0-1"
}`;

const LISTING_SYSTEM = `Tu esi VAUTO — išmanus lietuviškas skelbimų portalo AI asistentas.
Visada grąžink TIK vieną JSON objektą pagal schemą — jokio markdown.
Analizuok nuotrauką ir nustatyk tikslų objektą (pvz. gitara → SPORTAS arba NAMAI, priklausomai nuo konteksto; elektronika → ELEKTRONIKA).
Aprašymą sugeneruok išsamiai lietuviškai.`;

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

/** Strip data-URL prefix — Gemini expects raw Base64 only. */
export function dataUrlToInlinePart(dataUrl: string): GeminiContentPart | null {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) return null;

  const data = match[2].replace(/\s/g, "");
  if (!data) return null;

  return {
    inlineData: {
      mimeType: match[1] || "image/jpeg",
      data,
    },
  };
}

export async function imageInputToInlinePart(
  input: string | Blob | File
): Promise<GeminiContentPart> {
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

function mapRawListingJson(
  raw: Record<string, unknown>,
  userCity: string,
  contact: string
): AiExtractedListing {
  const categoryKey = String(raw.category ?? "NAMAI").toUpperCase();
  const internalCategory = VALID_LISTING_CATEGORIES.has(categoryKey)
    ? CATEGORY_TO_INTERNAL[categoryKey]!
    : "other";

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

  return `Išanalizuok šią nuotrauką skelbimui įkelti. Grąžink JSON struktūrą su preke (pvz. Gitara), aprašymu ir parink teisingą kategoriją.

Analizuok nuotrauką(-as). Atpažink TIKSLŲ objektą — pavadinimas ir kategorija turi atitikti tai, ką matai (gitara → SPORTAS, laptopas → ELEKTRONIKA, sofa → NAMAI).${textNote}${extra}
Numatytas miestas: ${userCity}
Grąžink JSON: ${LISTING_SCHEMA}`;
}

async function geminiGenerateJson(
  apiKey: string,
  systemInstruction: string,
  userParts: GeminiContentPart[]
): Promise<Record<string, unknown>> {
  let lastError: unknown;

  for (const model of GEMINI_MODELS) {
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
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      lastError = new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
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

async function geminiChatJson(
  apiKey: string,
  systemInstruction: string,
  userPrompt: string
): Promise<Record<string, unknown>> {
  return geminiGenerateJson(apiKey, systemInstruction, [{ text: userPrompt }]);
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

  const city = resolveListingCity(input.userCity?.trim(), "Vilnius");
  const contact = input.contact?.trim() || "+370 612 34567";
  const prompt = buildListingImagePrompt(city, input.transcript, input.extraContext);

  const raw = await geminiGenerateJson(
    apiKey,
    `${LISTING_SYSTEM}\n\n${DEFAULT_JSON_SYSTEM}`,
    [...inlineParts, { text: prompt }]
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
}): Promise<ClientSearchIntent> {
  const apiKey = getClientGeminiApiKey();
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GEMINI_API_KEY not configured");
  }

  const query = input.query.trim();
  const systemInstruction = `Esi VAUTO pirkėjo paieškos intent analizatorius. Semantiškai suprask lietuvių kalbą.
Vartotojas IEŠKO skelbimų — nekelia skelbimo.
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
    category,
    cleanQuery: String(raw.cleanQuery ?? "").trim(),
    location: String(raw.location ?? "").trim(),
    radiusKm: snapSearchRadius(raw.radiusKm),
    condition:
      raw.condition === "used" || raw.condition === "new" ? raw.condition : null,
  };
}
