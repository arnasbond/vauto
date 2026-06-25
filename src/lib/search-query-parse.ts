import { detectCityFuzzy, LT_CITY_NAMES } from "@/lib/lt-cities";

export type ParsedConditionFilter = "used" | "new";

/** Collapse split brand tokens: „vol vo“ → „volvo“ */
const BRAND_ALIASES: Array<[RegExp, string]> = [
  [/\bvol\s+vo\b/gi, "volvo"],
  [/\bmerc(?:edes)?\s+benz\b/gi, "mercedes benz"],
  [/\bmerc\b/gi, "mercedes"],
  [/\bvw\b/gi, "volkswagen"],
];

function normalizeBrandAliases(text: string): string {
  let t = text;
  for (const [pattern, replacement] of BRAND_ALIASES) {
    t = t.replace(pattern, replacement);
  }
  return t;
}

export interface ParsedSearchIntent {
  cleanQuery: string;
  cityNominative?: string;
  radiusKm?: number;
  condition?: ParsedConditionFilter;
  category?: string;
}

export function detectRadiusKm(text: string): number | undefined {
  const kmMatch = text.match(/(\d{1,3})\s*(?:km|kilometr)/i);
  if (kmMatch) {
    const n = Number(kmMatch[1]);
    if (n === 5 || n === 10 || n === 20 || n === 50) return n;
    if (n > 0 && n <= 50) return n <= 7 ? 5 : n <= 15 ? 10 : n <= 35 ? 20 : 50;
  }
  if (/\+\s*5\s*km|5\s*km\s*spindul/i.test(text)) return 5;
  if (/\+\s*10\s*km|10\s*km\s*spindul/i.test(text)) return 10;
  if (/\+\s*20\s*km|20\s*km\s*spindul/i.test(text)) return 20;
  if (/\+\s*50\s*km|50\s*km\s*spindul/i.test(text)) return 50;
  return undefined;
}

function detectCondition(text: string): ParsedConditionFilter | undefined {
  if (/\b(naudot\w*|used)\b/i.test(text)) return "used";
  if (/\b(nauj\w*|new|sealed)\b/i.test(text)) return "new";
  return undefined;
}

/**
 * Offline fallback — geo/condition hints only. Semantic category/product parsing is Gemini-only.
 */
export function parseSearchIntentFallback(text: string): ParsedSearchIntent {
  const normalized = normalizeBrandAliases(text.trim());
  const cityNominative = detectCityFuzzy(normalized);
  const condition = detectCondition(normalized);
  let radiusKm = detectRadiusKm(normalized);
  const hasProximity =
    /\b(aplink|apie|šalia|salia|arti)\b/i.test(normalized) || radiusKm != null;

  if (radiusKm == null && hasProximity && cityNominative) {
    radiusKm = 20;
  }

  return {
    cleanQuery: normalized,
    cityNominative,
    radiusKm,
    condition,
  };
}

/** @deprecated Use resolveSearchIntent (Gemini). Kept for tests / legacy imports. */
export function parseSearchIntent(text: string): ParsedSearchIntent {
  return parseSearchIntentFallback(text);
}

export { LT_CITY_NAMES };
