import type { AgentChatMessage } from "@/lib/vauto-agent-client";

/** Last N chat messages sent to Gemini (~4 user turns). */
export const AGENT_SESSION_MESSAGE_LIMIT = 8;

export interface AgentSearchFilters {
  query?: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  /** Free-text refinements merged into query (spalva, dalys, paslaugos). */
  refinements?: string[];
}

export function selectAgentSessionMessages(
  messages: AgentChatMessage[],
  limit = AGENT_SESSION_MESSAGE_LIMIT
): AgentChatMessage[] {
  if (messages.length <= limit) return messages;
  return messages.slice(-limit);
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

/** Detect short refinement utterances that should inherit prior search filters. */
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

/** Detect cardinal new search that should discard prior session filters. */
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

export function parseSearchFiltersFromUserText(text: string): Partial<AgentSearchFilters> {
  const t = text.toLowerCase();
  const filters: Partial<AgentSearchFilters> = { query: text.trim() };

  const priceMatch = t.match(/(?:iki|max|ne daugiau)\s*(\d{2,5})\s*(?:€|eur)?/i);
  if (priceMatch) filters.maxPrice = Number(priceMatch[1]);

  for (const [re, city] of [
    [/vilniuje|vilnius\b/i, "Vilnius"],
    [/kaune|kaunas\b/i, "Kaunas"],
    [/klaip[eė]doje|klaip[eė]da\b/i, "Klaipėda"],
    [/panev[eė][žz]yje|panev[eė][žz]ys\b/i, "Panevėžys"],
  ] as const) {
    if (re.test(text)) {
      filters.city = city;
      break;
    }
  }

  if (/\b(dyzel|dyzelin)\b/i.test(t)) filters.category = "vehicles";
  if (/\b(bmw|mercedes|audi|volvo|volkswagen)\b/i.test(t)) filters.category = "vehicles";
  if (/\b(iphone|samsung|telefon)\b/i.test(t)) filters.category = "electronics";

  return filters;
}

export function filtersFromSearchAction(action: {
  searchQuery?: string;
  filters?: AgentSearchFilters;
  filtersReset?: boolean;
}): AgentSearchFilters | null {
  if (action.filtersReset && action.filters) {
    return action.filters;
  }
  if (action.filters && Object.keys(action.filters).length) {
    return action.filters;
  }
  if (action.searchQuery?.trim()) {
    return { query: action.searchQuery.trim() };
  }
  return null;
}
