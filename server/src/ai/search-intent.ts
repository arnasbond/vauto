import { unifiedLlmJson } from "./llm-provider.js";

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

function snapSearchRadius(km: unknown): number | null {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  return 50;
}

export interface AnalyzeSearchInput {
  query: string;
  userCity?: string;
}

export interface AnalyzeSearchResult {
  category: string | null;
  cleanQuery: string;
  location: string;
  radiusKm: number | null;
  condition: "used" | "new" | null;
  source?: "gemini" | "fallback";
}

const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/\b(rub|drabuž|marškin|keln|batai)\w*/i, "Drabužiai"],
  [/\b(iphone|telefon|kompiuter|nešiojam|macbook|samsung|elektron)\w*/i, "Elektronika"],
  [/\b(auto|automob|bmw|audi|volvo|toyota|mercedes)\w*/i, "Auto"],
  [/\b(but|butas|nam|nt|sklyp)\w*/i, "NT"],
  [/\b(darbas|alg|cv|hiring)\w*/i, "Darbas"],
  [/\b(paslaug|remont|valym)\w*/i, "Paslaugos"],
  [/\b(sofa|bald|virtuv|indap)\w*/i, "Namai"],
];

function analyzeSearchIntentFallback(
  input: AnalyzeSearchInput
): AnalyzeSearchResult {
  const query = input.query.trim();
  const cleanQuery =
    query
      .replace(
        /\b(kas|kur|ka|ko|ar|rask|iešk\w*|iesk\w*|parduoda|noriu|reikia|man)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim() || query;

  let category: string | null = null;
  for (const [pattern, label] of CATEGORY_HINTS) {
    if (pattern.test(query)) {
      category = label;
      break;
    }
  }

  return {
    category,
    cleanQuery,
    location: input.userCity?.trim() ?? "",
    radiusKm: null,
    condition: null,
    source: "fallback",
  };
}

/** Gemini structured buyer search intent — single input object, no positional args. */
export async function analyzeSearchIntent(
  input: AnalyzeSearchInput
): Promise<AnalyzeSearchResult> {
  const query = input.query.trim();
  const systemInstruction = `Esi VAUTO pirkėjo paieškos intent analizatorius. Semantiškai suprask lietuvių kalbą.
Vartotojas IEŠKO skelbimų — nekelia skelbimo.
Grąžink tik JSON pagal schemą: ${SEARCH_INTENT_SCHEMA}`;

  const userPrompt = `Užklausa: "${query}"
Numatytas vartotojo miestas: ${input.userCity ?? "Lietuva"}`;

  try {
    const raw = await unifiedLlmJson({
      prompt: userPrompt,
      systemInstruction,
    });

    const categoryRaw = raw.category;
    const category =
      categoryRaw == null || categoryRaw === "null"
        ? null
        : SEARCH_CATEGORIES.has(String(categoryRaw))
          ? String(categoryRaw)
          : null;

    return {
      category,
      cleanQuery: String(raw.cleanQuery ?? "").trim(),
      location: String(raw.location ?? "").trim(),
      radiusKm: snapSearchRadius(raw.radiusKm),
      condition:
        raw.condition === "used" || raw.condition === "new" ? raw.condition : null,
      source: "gemini",
    };
  } catch (e) {
    console.warn("[analyze-search] Gemini unavailable, using fallback:", e);
    return analyzeSearchIntentFallback(input);
  }
}
