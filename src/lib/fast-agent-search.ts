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
import { buildEmptySearchReply } from "@/lib/agent-reply-display";
import {
  extractProductSearchTokens,
  listingMatchesProductTokens,
} from "@/lib/search-token-filter";

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
  if (detectSellerListingIntent(t) && extractProductSearchTokens(t).length === 0) return false;
  if (SKIP_FAST.test(t)) return false;
  if ((t.match(/\?/g) ?? []).length > 1) return false;
  return true;
}

function filterListings(listings: Listing[], params: FastSearchParams): Listing[] {
  const city = params.cityNominative ? normCity(params.cityNominative) : "";
  const query = params.query?.trim() ?? "";

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
    const tokens = extractProductSearchTokens(query);
    if (!tokens.length) return [];
    filtered = filtered.filter((l) => {
      if (!listingMatchesStrictBrandQuery(l, query)) return false;
      return listingMatchesProductTokens(l, query);
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
  options?: { userCity?: string; wardrobeOnly?: boolean }
): Promise<FastSearchResult | null> {
  if (!canUseFastSearch(text)) return null;

  const intent = await resolveSearchIntent(text, {
    userCity: options?.userCity,
    wardrobeOnly: options?.wardrobeOnly,
  });

  const limit = listings.length > 0 ? listings.length : UNLIMITED_SEARCH;
  const browseAll = BROWSE_ALL.test(text);

  const params: FastSearchParams = {
    query: browseAll ? "" : intent.cleanQuery || extractProductSearchTokens(text).join(" "),
    category: options?.wardrobeOnly ? "clothing" : intent.category,
    cityNominative: intent.cityNominative,
    radiusKm: intent.radiusKm,
    condition: intent.condition,
    limit,
  };

  if (!browseAll && params.query.length < 2 && !params.cityNominative && !params.category) {
    return null;
  }

  const results = filterListings(
    options?.wardrobeOnly ? listings.filter((l) => l.category === "clothing") : listings,
    params
  );
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
    reply: buildEmptySearchReply(searchQuery),
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
