import { unifiedLlmJson, visionExtractJson } from "./llm-provider.js";
import { normalizeImageInputList } from "./image-input.js";
import {
  VISION_ANTI_HALLUCINATION_RULE,
  WARDROBE_ANTI_HALLUCINATION_RULE,
} from "./vision-guardrails.js";

const SPINTA_SEARCH_SYSTEM_RULE = `
GRIEŽTA SPINTOS TAISYKLĖ: Vartotojas yra VAUTO Spintoje (drabužių ir batų portalas).
category VISADA turi būti "Drabužiai" (listingCategory: clothing).
NIEKADA negrąžink Auto, Elektronika, Namai, NT, Paslaugos, Darbas kategorijų.
Paieška TIK drabužiai, batai, avalynė, apranga, aksesuarai — jokios padangos, automobilių dalių ar kitų prekių.`;

const SEARCH_INTENT_SCHEMA = `{
  "category": "Auto | Elektronika | Namai | Drabužiai | Paslaugos | NT | Darbas | null",
  "cleanQuery": "string — produkto ar paslaugos pavadinimas lietuviškai, be klausiamųjų žodžių (kas, kur, rask)",
  "location": "string — Lietuvos miestas vardininku (Vilnius, Kaunas, …) arba tuščia eilutė",
  "radiusKm": "number | null — tik 5, 10, 20, 50 arba null",
  "condition": "used | new | null"
}`;

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
    "make": "string | null — auto markė (BMW, Volkswagen, …)",
    "model": "string | null",
    "bodyType": "string | null — Sedanas, Hečbekas, Universalas, Visureigis / SUV, …",
    "color": "string | null — Pilka, Juoda, Balta, Mėlyna, …",
    "fuelType": "string | null — Benzinas, Dyzelinas, Elektra, …",
    "propertyType": "string | null — butas, namas, sklypas, …",
    "rooms": "string | null — 1, 2, 3, 4, 5+",
    "furnishing": "string | null — Įrengtas, Neįrengtas, …",
    "transactionType": "string | null — Parduoda, Nuomoja, …",
    "brand": "string | null — drabužių/elektronikos prekės ženklas",
    "size": "string | null",
    "clothingType": "string | null"
  }
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

const CATEGORY_TO_LISTING: Record<string, string> = {
  Auto: "vehicles",
  Elektronika: "electronics",
  Namai: "home",
  Drabužiai: "clothing",
  Paslaugos: "services",
  NT: "real_estate",
  Darbas: "jobs",
};

function snapSearchRadius(km: unknown): number | null {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  return 50;
}

function normalizeCategory(raw: unknown): string | null {
  if (raw == null || raw === "null") return null;
  const label = String(raw);
  return SEARCH_CATEGORIES.has(label) ? label : null;
}

function normalizeCondition(raw: unknown): "used" | "new" | null {
  return raw === "used" || raw === "new" ? raw : null;
}

function normalizeSearchFilters(raw: unknown): VisualSearchFilters {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: VisualSearchFilters = {};
  for (const key of [
    "make",
    "model",
    "bodyType",
    "color",
    "fuelType",
    "propertyType",
    "rooms",
    "furnishing",
    "transactionType",
    "brand",
    "size",
    "clothingType",
  ] as const) {
    const val = r[key];
    if (val == null || val === "null") continue;
    const text = String(val).trim();
    if (text) out[key] = text;
  }
  return out;
}

function buildCleanQueryFromFilters(
  filters: VisualSearchFilters,
  fallback: string
): string {
  const tokens = [
    filters.color,
    filters.make,
    filters.model,
    filters.bodyType,
    filters.brand,
    filters.propertyType,
    filters.furnishing,
    fallback,
  ].filter(Boolean);
  const unique = [...new Set(tokens.map((t) => String(t).trim()).filter(Boolean))];
  return unique.join(" ").trim() || fallback.trim();
}

export interface AnalyzeSearchInput {
  query: string;
  userCity?: string;
  wardrobeOnly?: boolean;
}

export interface AnalyzeSearchResult {
  category: string | null;
  cleanQuery: string;
  location: string;
  radiusKm: number | null;
  condition: "used" | "new" | null;
}

export interface VisualSearchFilters {
  make?: string;
  model?: string;
  bodyType?: string;
  color?: string;
  fuelType?: string;
  propertyType?: string;
  rooms?: string;
  furnishing?: string;
  transactionType?: string;
  brand?: string;
  size?: string;
  clothingType?: string;
}

export interface AnalyzeVisualSearchInput {
  imageDataUrl?: string;
  imageDataUrls?: string[];
  imageBase64?: string;
  userCity?: string;
  userName?: string;
  extraContext?: string;
  wardrobeOnly?: boolean;
}

export interface AnalyzeVisualSearchResult {
  objectType: string;
  category: string | null;
  listingCategory: string | null;
  cleanQuery: string;
  location: string;
  radiusKm: number | null;
  condition: "used" | "new" | null;
  confidence: number;
  visualSummary: string;
  searchFilters: VisualSearchFilters;
}

/** Gemini structured buyer search intent (server-side; may 403 from Render IP). */
export async function analyzeSearchIntent(
  input: AnalyzeSearchInput
): Promise<AnalyzeSearchResult> {
  const query = input.query.trim();
  const systemInstruction = `Esi VAUTO pirkėjo paieškos intent analizatorius. Semantiškai suprask lietuvių kalbą.
Vartotojas IEŠKO skelbimų — nekelia skelbimo.
${input.wardrobeOnly ? SPINTA_SEARCH_SYSTEM_RULE : ""}
Grąžink tik JSON pagal schemą: ${SEARCH_INTENT_SCHEMA}`;

  const userPrompt = `Užklausa: "${query}"
Numatytas vartotojo miestas: ${input.userCity ?? "Lietuva"}`;

  const raw = await unifiedLlmJson({
    prompt: userPrompt,
    systemInstruction,
  });

  return {
    category: input.wardrobeOnly ? "Drabužiai" : normalizeCategory(raw.category),
    cleanQuery: String(raw.cleanQuery ?? "").trim(),
    location: String(raw.location ?? "").trim(),
    radiusKm: snapSearchRadius(raw.radiusKm),
    condition: normalizeCondition(raw.condition),
  };
}

/** Gemini Vision — nuotrauka → struktūrizuoti paieškos filtrai pirkėjui. */
export async function analyzeVisualSearchIntent(
  input: AnalyzeVisualSearchInput
): Promise<AnalyzeVisualSearchResult> {
  const images = normalizeImageInputList(
    input.imageDataUrls?.filter(Boolean).length
      ? input.imageDataUrls!.filter(Boolean)
      : input.imageDataUrl
        ? [input.imageDataUrl]
        : input.imageBase64
          ? [input.imageBase64]
          : []
  );

  if (!images.length) {
    throw new Error("imageDataUrl or imageBase64 is required");
  }

  const contextNote = input.extraContext?.trim()
    ? ` Papildomas vartotojo tekstas: ${input.extraContext.trim()}`
    : "";

  const systemInstruction = `Esi VAUTO pirkėjo VISUAL paieškos intent analizatorius su Gemini Vision.
Vartotojas IEŠKO panašių skelbimų pagal nuotrauką — NEKELIA skelbimo.
Identifikuok objekto tipą, markę, modelį, kėbulo tipą, spalvą, NT pobūdį, kambarius, aplinką.
Konvertuok tai į searchFilters ir cleanQuery lietuviškai.
${VISION_ANTI_HALLUCINATION_RULE}
${input.wardrobeOnly ? SPINTA_SEARCH_SYSTEM_RULE : ""}
Jei nuotraukoje visas automobilis — category "Auto", searchFilters.make/model/bodyType/color.
Jei butas/namas — category "NT", propertyType, rooms, furnishing.
Jei drabužis — category "Drabužiai", brand, color, size.
Grąžink tik JSON: ${VISUAL_SEARCH_INTENT_SCHEMA}`;

  const userPrompt = `Analizuok paieškos nuotrauką ir suformuok filtrus.
Numatytas vartotojo miestas: ${input.userCity ?? "Lietuva"}.${contextNote}`;

  const raw = await visionExtractJson(userPrompt, images);
  const category = input.wardrobeOnly ? "Drabužiai" : normalizeCategory(raw.category);
  const searchFilters = normalizeSearchFilters(raw.searchFilters);
  const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0.5));
  const visualSummary = String(raw.visualSummary ?? "").trim();
  const rejected =
    confidence < 0.2 ||
    /prekė neatpažinta|neatpažinta|logotip|tik tekst/i.test(visualSummary);

  if (rejected) {
    return {
      objectType: "other",
      category: null,
      listingCategory: null,
      cleanQuery: "",
      location: String(raw.location ?? input.userCity ?? "").trim(),
      radiusKm: snapSearchRadius(raw.radiusKm),
      condition: normalizeCondition(raw.condition),
      confidence: 0,
      visualSummary: "Prekė neatpažinta",
      searchFilters: {},
    };
  }

  const cleanQuery = buildCleanQueryFromFilters(
    searchFilters,
    String(raw.cleanQuery ?? "").trim()
  );

  return {
    objectType: input.wardrobeOnly
      ? "clothing"
      : String(raw.objectType ?? "other").trim() || "other",
    category,
    listingCategory: category ? (CATEGORY_TO_LISTING[category] ?? null) : null,
    cleanQuery,
    location: String(raw.location ?? input.userCity ?? "").trim(),
    radiusKm: snapSearchRadius(raw.radiusKm),
    condition: normalizeCondition(raw.condition),
    confidence,
    visualSummary: visualSummary || cleanQuery,
    searchFilters,
  };
}

function declineLithuanian(count: number, singular: string, plural: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return singular;
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 11 || mod100 > 19)) return plural;
  return plural;
}

/** Sekretoriaus TTS/tekstas po foto paieškos — pvz. „Arnoldai, suradau 5 panašius pilkus BMW sedanus Panevėžio regione!" */
export function buildVisualSearchVoiceCommentary(
  userName: string | undefined,
  intent: AnalyzeVisualSearchResult,
  resultCount: number
): string {
  const firstName = userName?.trim().split(/\s+/)[0]?.replace(/\.$/, "") || "drauge";
  const region = intent.location?.trim() || "Lietuva";
  const sf = intent.searchFilters;

  const descriptorParts: string[] = [];
  if (sf.color) descriptorParts.push(sf.color.toLowerCase());
  if (sf.make) descriptorParts.push(sf.make);
  if (sf.model) descriptorParts.push(sf.model);
  if (sf.bodyType) descriptorParts.push(sf.bodyType.toLowerCase());
  if (sf.propertyType) descriptorParts.push(sf.propertyType);
  if (sf.brand) descriptorParts.push(sf.brand);

  const subject =
    descriptorParts.length > 0
      ? descriptorParts.join(" ")
      : intent.cleanQuery || intent.visualSummary || "skelbimus";

  if (resultCount <= 0) {
    return `${firstName}, pagal tavo įkeltą nuotrauką neradau panašių „${subject}" ${region} regione. Pabandykim platesnę paiešką?`;
  }

  const countLabel =
    resultCount === 1
      ? "1 panašų"
      : `${resultCount} ${declineLithuanian(resultCount, "panašų", "panašius")}`;

  return `${firstName}, pagal tavo įkeltą nuotrauką suradau ${countLabel} ${subject} ${region} regione! Pasižiūrėkim.`;
}

