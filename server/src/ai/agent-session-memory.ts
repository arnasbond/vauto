import { resolveLtCityNominative } from "./lithuanian-location-normalize.js";

export interface AgentSearchFilters {
  query?: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  refinements?: string[];
}

export function mergeSearchFilters(
  previous: AgentSearchFilters | null,
  next: Partial<AgentSearchFilters>
): AgentSearchFilters {
  const refinements = [
    ...(previous?.refinements ?? []),
    ...(next.refinements ?? []),
  ].filter(Boolean);

  const mergedQuery = [next.query ?? previous?.query, ...refinements]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    query: mergedQuery || previous?.query || next.query,
    category: next.category ?? previous?.category,
    city: next.city ?? previous?.city,
    maxPrice: next.maxPrice ?? previous?.maxPrice,
    minPrice: next.minPrice ?? previous?.minPrice,
    refinements: refinements.length ? refinements : undefined,
  };
}

export function extractSearchRefinement(text: string): string | null {
  const t = text.trim();
  if (t.length > 120) return null;
  if (
    /^(o\s+)?(dab(ar)?\s+)?(rodyk|parodyk|tik|filtruok|palik)\b/i.test(t) ||
    /\b(tik|ir)\s+(pilk|balt|juod|mėlyn|raudon|sidabr|benzin|dyzel)/i.test(t) ||
    /\bspalvos?\b/i.test(t)
  ) {
    return t;
  }
  return null;
}

export function shouldResetSearchSession(
  text: string,
  previous: AgentSearchFilters | null
): boolean {
  if (!previous) return false;
  if (extractSearchRefinement(text)) return false;

  const t = text.toLowerCase();
  const prevQ = (previous.query ?? "").toLowerCase();
  const prevCity = (previous.city ?? "").toLowerCase();

  const cityPatterns: Array<[RegExp, string]> = [
    [/vilniuje|vilnius\b/i, "vilnius"],
    [/kaune|kaunas\b/i, "kaunas"],
    [/klaip[eė]doje|klaip[eė]da\b/i, "klaip"],
    [/panev[eė][žz]yje|panev[eė][žz]ys\b/i, "panev"],
    [/šiauliuose|šiauliai\b/i, "šiaul"],
    [/pasvalyje|pasvalys\b/i, "pasval"],
  ];

  for (const [re, key] of cityPatterns) {
    if (re.test(t) && prevCity && !prevCity.includes(key)) return true;
  }

  const pivotTerms = [
    "bmw",
    "mercedes",
    "audi",
    "volkswagen",
    "toyota",
    "iphone",
    "samsung",
    "volvo",
    "nauj",
    "naujausi",
    "naujus",
  ];
  for (const term of pivotTerms) {
    if (t.includes(term) && prevQ && !prevQ.includes(term)) return true;
  }

  if (/\bnuo\s+(201[5-9]|202\d)\b/.test(t) && previous.maxPrice && previous.maxPrice <= 4000) {
    return true;
  }

  if (/\b(dyzel|dyzelin|benzin)\b/.test(prevQ) && /\bbmw\b/.test(t)) return true;

  return false;
}

const CITY_PATTERNS: Array<[RegExp, string]> = [
  [/vilniuje|vilnius\b/i, "Vilnius"],
  [/kaune|kaunas\b/i, "Kaunas"],
  [/klaip[eė]doje|klaip[eė]da\b/i, "Klaipėda"],
  [/panev[eė][žz]yje|panev[eė][žz]ys\b/i, "Panevėžys"],
  [/pasvalyje|pasvaly\b/i, "Pasvalys"],
  [/šiauliuose|šiauliai\b/i, "Šiauliai"],
];

export function parseSearchFiltersFromUserText(text: string): AgentSearchFilters {
  const t = text.toLowerCase();
  const filters: AgentSearchFilters = { query: text.trim() };

  const priceMatch = t.match(/(?:iki|max|ne daugiau)\s*(\d{2,5})\s*(?:€|eur)?/i);
  if (priceMatch) filters.maxPrice = Number(priceMatch[1]);

  for (const [re, city] of CITY_PATTERNS) {
    if (re.test(text)) {
      filters.city = resolveLtCityNominative(city);
      break;
    }
  }

  if (!filters.city) {
    const locMatch = text.match(
      /\b(\w+(?:yje|iuose|ėje|uose))\b/i
    );
    if (locMatch?.[1]) {
      filters.city = resolveLtCityNominative(locMatch[1]);
    }
  }

  if (/\b(dyzel|dyzelin)\b/i.test(t)) filters.category = "vehicles";
  if (/\b(bmw|mercedes|audi|volvo|volkswagen)\b/i.test(t)) filters.category = "vehicles";
  if (/\b(iphone|samsung|telefon)\b/i.test(t)) filters.category = "electronics";
  if (/\b(dal|dalių|daliu)\b/i.test(t)) filters.category = "vehicles";

  return filters;
}

export function applySessionUtterance(
  text: string,
  previous: AgentSearchFilters | null
): { filters: AgentSearchFilters; sessionReset: boolean; refinement: string | null } {
  if (shouldResetSearchSession(text, previous)) {
    return {
      filters: parseSearchFiltersFromUserText(text),
      sessionReset: true,
      refinement: null,
    };
  }

  const refinement = extractSearchRefinement(text);
  if (refinement && previous) {
    return {
      filters: mergeSearchFilters(previous, { refinements: [refinement] }),
      sessionReset: false,
      refinement,
    };
  }

  return {
    filters: parseSearchFiltersFromUserText(text),
    sessionReset: false,
    refinement: null,
  };
}
