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
}

/** Gemini structured buyer search intent — single input object, no positional args. */
export async function analyzeSearchIntent(
  input: AnalyzeSearchInput
): Promise<AnalyzeSearchResult> {
  const query = input.query.trim();
  const prompt = `Esi VAUTO pirkėjo paieškos intent analizatorius. Semantiškai suprask lietuvių kalbą.
Vartotojas IEŠKO skelbimų.

Užklausa: "${query}"
Numatytas vartotojo miestas: ${input.userCity ?? "Lietuva"}

Grąžink TIK vieną JSON objektą: ${SEARCH_INTENT_SCHEMA}`;

  const raw = await unifiedLlmJson({ prompt });

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
  };
}
