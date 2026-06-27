import type { Listing } from "@/lib/types";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { resolveSearchIntent } from "@/lib/gemini-search-intent";
import { listingMatchesStrictBrandQuery } from "@/lib/strict-brand-search";
import { detectSellerListingIntent } from "@/lib/scoring";
import {
  isViewModeOnlyCommand,
  type MarketplaceSortMode,
} from "@/lib/marketplace-view";
import { isConversationalSearchIntent } from "@/lib/search-conversational-intent";

/** 0 = no slice — process full catalog dynamically */
export const UNLIMITED_SEARCH = 0;

export interface FastSearchParams {
  query: string;
  category?: string;
  cityNominative?: string;
  radiusKm?: number;
  condition?: "used" | "new";
  limit: number;
}

export interface FastSearchResult {
  reply: string;
  actions: VautoAgentAction;
  toolCalls: { name: string; result: unknown }[];
}

const SKIP_FAST =
  /\b(admin|moderuoti|blokiruoti|boost|apmokėti|apmoketi|iškel|iskel|trigger|business\s+pro|dashboard|statistika)\b/i;

const BROWSE_ALL =
  /\b(visus?\s+skelbimus?|visi\s+skelbimai|parodyk\s+viską|parodyk\s+viska|rodyti\s+visus|show\s+all)\b/i;

function normCity(loc: string): string {
  return loc
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function agentFiltersFromParams(params: FastSearchParams) {
  return {
    query: params.query || undefined,
    category: params.category,
    city: params.cityNominative,
    radiusKm: params.radiusKm,
    condition: params.condition,
  };
}

export function canUseFastSearch(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 140) return false;
  if (isConversationalSearchIntent(t)) return false;
  if (isViewModeOnlyCommand(t)) return false;
  if (detectSellerListingIntent(t)) return false;
  if (SKIP_FAST.test(t)) return false;
  if ((t.match(/\?/g) ?? []).length > 1) return false;
  return true;
}

function matchesProductTokens(haystack: string, query: string): boolean {
  const tokens = query.split(/[\s,.;:!?]+/).filter((t) => t.length >= 2);
  if (!tokens.length) return haystack.includes(query);

  const collapsed = query.replace(/\s+/g, "");
  if (collapsed.length >= 4) {
    const hayCollapsed = haystack.replace(/\s+/g, "");
    if (hayCollapsed.includes(collapsed)) return true;
  }

  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return hits >= Math.max(1, Math.ceil(tokens.length * 0.5));
}

function filterListings(listings: Listing[], params: FastSearchParams): Listing[] {
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
    filtered = filtered.filter((l) => {
      if (!listingMatchesStrictBrandQuery(l, query)) return false;
      const haystack =
        `${l.title} ${l.description ?? ""} ${l.category} ${(l.tags ?? []).join(" ")} ${String(l.attributes?.make ?? "")}`.toLowerCase();
      return matchesProductTokens(haystack, query);
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

/**
 * Gemini-powered buyer search — structured intent → marketplace filters + pinned IDs.
 */
export async function runFastAgentSearch(
  text: string,
  listings: Listing[],
  options?: { userCity?: string }
): Promise<FastSearchResult | null> {
  if (!canUseFastSearch(text)) return null;

  const intent = await resolveSearchIntent(text, {
    userCity: options?.userCity,
  });

  const limit = listings.length > 0 ? listings.length : UNLIMITED_SEARCH;
  const browseAll = BROWSE_ALL.test(text);

  const params: FastSearchParams = {
    query: browseAll ? "" : intent.cleanQuery,
    category: intent.category,
    cityNominative: intent.cityNominative,
    radiusKm: intent.radiusKm,
    condition: intent.condition,
    limit,
  };

  if (!browseAll && params.query.length < 2 && !params.cityNominative && !params.category) {
    return null;
  }

  const results = filterListings(listings, params);
  const searchQuery = params.query || text.trim();
  const filters = agentFiltersFromParams(params);

  if (results.length > 0) {
    return {
      reply: "Atidarau skelbimus ekrane.",
      actions: {
        type: "search",
        searchQuery,
        listingIds: results.map((r) => r.id),
        filters,
      },
      toolCalls: [
        {
          name: "searchListings",
          result: {
            count: results.length,
            geminiIntent: true,
            source: intent.source,
          },
        },
      ],
    };
  }

  return {
    reply: "Rezultatų nerasta.",
    actions: {
      type: "empty_search",
      searchQuery,
      filters,
    },
    toolCalls: [
      {
        name: "searchListings",
        result: {
          count: 0,
          geminiIntent: true,
          source: intent.source,
        },
      },
    ],
  };
}

export { detectRadiusKm } from "@/lib/search-query-parse";
