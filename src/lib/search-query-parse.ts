import { detectCityFuzzy, LT_CITY_NAMES, LT_CITY_PATTERNS } from "@/lib/lt-cities";
import { VEHICLE_BRAND_PATTERN } from "@/lib/vehicle-keywords";

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

const NORM = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();

const SEARCH_PREFIX =
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk(?:\s+visus)?|norėčiau|noreciau|ieškoti|ieskoti|find|search|show)\s+/i;

const SEARCH_STOP_WORDS = new Set([
  "rask",
  "surask",
  "ieskau",
  "ieskoti",
  "parodyk",
  "rodyti",
  "noreciau",
  "norečiau",
  "aplink",
  "apie",
  "salia",
  "šalia",
  "arti",
  "mieste",
  "miestas",
  "miesto",
  "naudotas",
  "naudota",
  "naujas",
  "nauja",
  "used",
  "new",
  "skelbimus",
  "skelbima",
  "skelbimai",
  "automobili",
  "automobilis",
  "auto",
  "masina",
  "masina",
  "km",
  "kilometr",
  "kilometru",
  "spinduliu",
  "spindulys",
  "man",
  "mano",
  "visus",
  "viso",
  "find",
  "search",
  "show",
  "lietuvoje",
  "lietuvos",
]);

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

function detectCategory(query: string): string | undefined {
  const q = query.toLowerCase();
  if (
    VEHICLE_BRAND_PATTERN.test(q) ||
    /\b(auto|automob|transporto|ratlank|padang|vin)\b/i.test(q)
  ) {
    return "vehicles";
  }
  if (/\b(butas|namas|sklypas|nt\b|nekilnojam|nuomoju)\b/i.test(q)) {
    return "real_estate";
  }
  if (/\b(darbas|etat|atlyginim|cv\b)\b/i.test(q)) return "jobs";
  if (/\b(drabuž|batai|striuk|dydis)\b/i.test(q)) return "clothing";
  if (/\b(meistr|paslaug|remont)\b/i.test(q)) return "services";
  return undefined;
}

function stripSearchPrefixes(raw: string): string {
  let q = raw.trim();
  q = q.replace(SEARCH_PREFIX, "");
  q = q.replace(/\b(skelbimus?|skelbimus|visus|viso)\b/gi, " ");
  return q.replace(/\s+/g, " ").trim();
}

function isCityWord(word: string, city: string): boolean {
  const nw = NORM(word);
  if (nw.length < 4) return false;
  const cn = NORM(city);
  const overlap = Math.min(5, nw.length, cn.length);
  return overlap >= 4 && nw.slice(0, overlap) === cn.slice(0, overlap);
}

function stripCityFromText(text: string, city: string): string {
  let working = text;
  for (const [pattern] of LT_CITY_PATTERNS) {
    working = working.replace(pattern, " ");
  }
  working = working
    .split(/[\s,.;:!?'"-]+/)
    .filter((w) => w.length > 0 && !isCityWord(w, city))
    .join(" ");
  return working;
}

/**
 * Parse natural-language LT search into clean product query + filter hints.
 * „Rask volvo v70 aplink Panevėžy naudotas“ → cleanQuery: volvo v70, city, +20 km, used.
 */
export function parseSearchIntent(text: string): ParsedSearchIntent {
  const normalized = normalizeBrandAliases(text);
  const cityNominative = detectCityFuzzy(normalized);
  const condition = detectCondition(normalized);
  let radiusKm = detectRadiusKm(normalized);
  const hasProximity =
    /\b(aplink|apie|šalia|salia|arti)\b/i.test(normalized) || radiusKm != null;

  if (radiusKm == null && hasProximity && cityNominative) {
    radiusKm = 20;
  }

  let working = normalized;
  if (cityNominative) {
    working = stripCityFromText(working, cityNominative);
  }
  working = working.replace(/\d{1,3}\s*km/gi, " ");
  working = working.replace(/\bspindul(?:iu|yje|ys)\b/gi, " ");
  working = stripSearchPrefixes(working);

  const tokens = working
    .split(/[\s,.;:!?]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .map((t) => NORM(t))
    .filter((t) => !SEARCH_STOP_WORDS.has(t));

  const cleanQuery = tokens.join(" ").trim();
  const category = detectCategory(cleanQuery);

  return {
    cleanQuery,
    cityNominative,
    radiusKm,
    condition,
    category,
  };
}

export { LT_CITY_NAMES };
