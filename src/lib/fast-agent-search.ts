import type { Listing } from "@/lib/types";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { detectSellerListingIntent } from "@/lib/scoring";
import {
  isViewModeOnlyCommand,
  type MarketplaceSortMode,
} from "@/lib/marketplace-view";
import { VEHICLE_BRAND_PATTERN } from "@/lib/vehicle-keywords";

/** 0 = no slice — process full catalog dynamically */
export const UNLIMITED_SEARCH = 0;

export interface FastSearchParams {
  query: string;
  category?: string;
  cityNominative?: string;
  radiusKm?: number;
  limit: number;
}

export interface FastSearchResult {
  reply: string;
  actions: VautoAgentAction;
  toolCalls: { name: string; result: unknown }[];
}

const SEARCH_PREFIX =
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk(?:\s+visus)?|norėčiau|noreciau|ieškoti|ieskoti|find|search|show)\s+/i;

const SKIP_FAST =
  /\b(admin|moderuoti|blokiruoti|boost|apmokėti|apmoketi|iškel|iskel|trigger|business\s+pro|dashboard|statistika)\b/i;

const BROWSE_ALL =
  /\b(visus?\s+skelbimus?|visi\s+skelbimai|parodyk\s+viską|parodyk\s+viska|rodyti\s+visus|show\s+all)\b/i;

import { detectCityFromPatterns, LT_CITY_PATTERNS } from "@/lib/lt-cities";

function normCity(loc: string): string {
  return loc
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function stripSearchPrefixes(raw: string): string {
  let q = raw.trim();
  q = q.replace(SEARCH_PREFIX, "");
  q = q.replace(/\b(skelbimus?|skelbimus|visus|viso)\b/gi, " ");
  return q.replace(/\s+/g, " ").trim();
}

function detectCity(raw: string): string | undefined {
  return detectCityFromPatterns(raw);
}

/** Parse radius from voice/text: „20 km spinduliu aplink Panevėžį“ */
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

function detectCategory(query: string): string | undefined {
  const q = query.toLowerCase();
  if (VEHICLE_BRAND_PATTERN.test(q) || /\b(auto|automob|transporto|ratlank|padang|vin)\b/i.test(q)) {
    return "vehicles";
  }
  if (/\b(butas|namas|sklypas|nt\b|nekilnojam|nuomoju)\b/i.test(q)) return "real_estate";
  if (/\b(darbas|etat|atlyginim|cv\b)\b/i.test(q)) return "jobs";
  if (/\b(drabuž|batai|striuk|dydis)\b/i.test(q)) return "clothing";
  if (/\b(meistr|paslaug|remont)\b/i.test(q)) return "services";
  return undefined;
}

export function canUseFastSearch(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 140) return false;
  if (isViewModeOnlyCommand(t)) return false;
  if (detectSellerListingIntent(t)) return false;
  if (SKIP_FAST.test(t)) return false;
  if ((t.match(/\?/g) ?? []).length > 1) return false;
  return true;
}

export function parseFastSearchParams(
  text: string,
  catalogSize = UNLIMITED_SEARCH
): FastSearchParams | null {
  if (!canUseFastSearch(text)) return null;

  const cityNominative = detectCity(text);
  const radiusKm = detectRadiusKm(text);
  let working = text;
  if (cityNominative) {
    for (const [pattern] of LT_CITY_PATTERNS) {
      working = working.replace(pattern, " ");
    }
  }
  working = working.replace(/\d{1,3}\s*km/gi, " ");
  working = working.replace(/\bspindul(?:iu|yje|ys)\b/gi, " ");

  const limit = catalogSize > 0 ? catalogSize : UNLIMITED_SEARCH;

  if (BROWSE_ALL.test(text)) {
    return {
      query: "",
      category: detectCategory(working),
      cityNominative,
      radiusKm,
      limit,
    };
  }

  const query = stripSearchPrefixes(working);
  if (query.length < 2) return null;

  return {
    query: query.toLowerCase(),
    category: detectCategory(query),
    cityNominative,
    radiusKm,
    limit,
  };
}

function filterListings(
  listings: Listing[],
  params: FastSearchParams
): Listing[] {
  const city = params.cityNominative ? normCity(params.cityNominative) : "";
  const query = params.query;

  let filtered = listings.filter((l) => l.price > 0 && !l.banned);

  if (params.category) {
    filtered = filtered.filter((l) => l.category === params.category);
  }

  if (city && !params.radiusKm) {
    filtered = filtered.filter(
      (l) =>
        normCity(l.location) === city ||
        l.location.toLowerCase().includes(city)
    );
  }

  if (query) {
    const tokens = query.split(/[\s,.;:!?]+/).filter((t) => t.length >= 2);
    filtered = filtered.filter((l) => {
      const haystack = `${l.title} ${l.description ?? ""} ${l.category}`.toLowerCase();
      if (!tokens.length) return haystack.includes(query);
      const hits = tokens.filter((t) => haystack.includes(t)).length;
      return hits >= Math.max(1, Math.ceil(tokens.length * 0.34));
    });
  }

  if (params.limit > 0) {
    return filtered.slice(0, params.limit);
  }
  return filtered;
}

/** Instant client-side sort for marketplace grid (<1ms on demo catalog). */
export function sortListingsFast<T extends Listing>(
  listings: T[],
  mode: Exclude<MarketplaceSortMode, "relevance">
): T[] {
  const copy = [...listings];
  if (mode === "cheapest") {
    return copy.sort((a, b) => a.price - b.price);
  }
  if (mode === "newest") {
    return copy.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  return copy.sort((a, b) => a.distanceKm - b.distanceKm);
}

export function runFastAgentSearch(
  text: string,
  listings: Listing[]
): FastSearchResult | null {
  const params = parseFastSearchParams(text, listings.length);
  if (!params) return null;

  const results = filterListings(listings, params);
  const searchQuery = [params.query, params.cityNominative]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (results.length > 0) {
    return {
      reply: "Atidarau skelbimus ekrane.",
      actions: {
        type: "search",
        searchQuery: searchQuery || results[0]!.title,
        listingIds: results.map((r) => r.id),
        filters: {
          query: params.query || undefined,
          category: params.category,
          city: params.cityNominative,
          radiusKm: params.radiusKm,
        },
      },
      toolCalls: [
        {
          name: "searchListings",
          result: { count: results.length, fastPath: true },
        },
      ],
    };
  }

  return {
    reply: "Rezultatų nerasta.",
    actions: {
      type: "empty_search",
      searchQuery: searchQuery || params.query || text.trim(),
    },
    toolCalls: [
      {
        name: "searchListings",
        result: { count: 0, fastPath: true },
      },
    ],
  };
}
