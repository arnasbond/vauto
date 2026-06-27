import { apiAnalyzeSearchIntent, apiAnalyzeVisualSearchIntent } from "@/lib/api/client";

import { isAiProxyAvailable } from "@/lib/api/config";

import {
  clientAnalyzeSearchIntent,
  clientAnalyzeVisualSearchIntent,
  isClientGeminiAvailable,
} from "@/lib/gemini-browser";

import type { Listing, ListingCategory } from "@/lib/types";
import type { CategoryAttributeFilters } from "@/lib/category-attribute-filters";
import { applyCategoryAttributeFilters } from "@/lib/category-attribute-filters";
import { EMPTY_CATEGORY_ATTRIBUTE_FILTERS } from "@/lib/category-attribute-filters";
import type { AgentSearchFilters } from "@/lib/vauto-agent-client";
import { listingMatchesStrictBrandQuery } from "@/lib/strict-brand-search";
import {
  applyMarketplaceFilters,
  mergeAgentIntoMarketplaceFilters,
  normalizeMarketplaceFilters,
  snapRadiusKm,
  type MarketplaceFilterState,
} from "@/lib/marketplace-view";
import type { ScoredListing } from "@/lib/types";
import type { UserCoords } from "@/lib/geolocation";

import { parseSearchIntentFallback } from "@/lib/search-query-parse";



export type GeminiSearchCategoryLabel =

  | "Auto"

  | "Elektronika"

  | "Namai"

  | "Drabužiai"

  | "Paslaugos"

  | "NT"

  | "Darbas"

  | null;



export interface GeminiSearchIntent {

  category: GeminiSearchCategoryLabel;

  cleanQuery: string;

  location: string;

  radiusKm: number | null;

  condition: "used" | "new" | null;

}



export interface ResolvedSearchIntent {

  cleanQuery: string;

  category?: ListingCategory;

  cityNominative?: string;

  radiusKm?: number;

  condition?: "used" | "new";

  source: "gemini" | "fallback";

}



const CATEGORY_MAP: Record<

  Exclude<GeminiSearchCategoryLabel, null>,

  ListingCategory

> = {

  Auto: "vehicles",

  Elektronika: "electronics",

  Namai: "home",

  Drabužiai: "clothing",

  Paslaugos: "services",

  NT: "real_estate",

  Darbas: "jobs",

};



const VALID_CATEGORIES = new Set<string>([

  "Auto",

  "Elektronika",

  "Namai",

  "Drabužiai",

  "Paslaugos",

  "NT",

  "Darbas",

]);



const intentCache = new Map<

  string,

  { at: number; intent: ResolvedSearchIntent }

>();

const CACHE_TTL_MS = 90_000;



function cacheKey(query: string, userCity?: string) {

  return `${query.trim().toLowerCase()}|${(userCity ?? "").trim().toLowerCase()}`;

}



function normalizeRadius(km: unknown): number | undefined {

  const n = Number(km);

  if (!Number.isFinite(n) || n <= 0) return undefined;

  return snapRadiusKm(n);

}



function normalizeGeminiPayload(raw: unknown): GeminiSearchIntent | null {

  if (!raw || typeof raw !== "object") return null;

  const r = raw as Record<string, unknown>;

  const categoryRaw = r.category;

  const category =

    categoryRaw === null || categoryRaw === undefined || categoryRaw === "null"

      ? null

      : VALID_CATEGORIES.has(String(categoryRaw))

        ? (String(categoryRaw) as Exclude<GeminiSearchCategoryLabel, null>)

        : null;



  const cleanQuery = String(r.cleanQuery ?? "").trim();

  const location = String(r.location ?? "").trim();

  const radiusKm = normalizeRadius(r.radiusKm) ?? null;



  const conditionRaw = r.condition;

  const condition =

    conditionRaw === "used" || conditionRaw === "new" ? conditionRaw : null;



  if (!cleanQuery && !category && !location) return null;



  return {

    category,

    cleanQuery,

    location,

    radiusKm,

    condition,

  };

}



function geminiToResolved(

  gemini: GeminiSearchIntent,

  rawQuery: string

): ResolvedSearchIntent {

  const category = gemini.category ? CATEGORY_MAP[gemini.category] : undefined;

  return {

    cleanQuery: gemini.cleanQuery || rawQuery.trim(),

    category,

    cityNominative: gemini.location || undefined,

    radiusKm: gemini.radiusKm ?? undefined,

    condition: gemini.condition ?? undefined,

    source: "gemini",

  };

}



function mergeWithGeoFallback(

  gemini: ResolvedSearchIntent,

  rawQuery: string

): ResolvedSearchIntent {

  const geo = parseSearchIntentFallback(rawQuery);

  return {

    ...gemini,

    cleanQuery: gemini.cleanQuery || geo.cleanQuery,

    cityNominative: gemini.cityNominative || geo.cityNominative,

    radiusKm: gemini.radiusKm ?? geo.radiusKm,

    condition: gemini.condition ?? geo.condition,

  };

}



function cacheIntent(key: string, intent: ResolvedSearchIntent) {

  intentCache.set(key, { at: Date.now(), intent });

}



/**

 * Resolve buyer search intent — browser Gemini first (bypasses Render IP block),

 * then optional server proxy for SSR/tests.

 */

export async function resolveSearchIntent(

  rawQuery: string,

  options?: { userCity?: string }

): Promise<ResolvedSearchIntent> {

  const query = rawQuery.trim();

  if (!query) {

    return { cleanQuery: "", source: "fallback" };

  }



  const key = cacheKey(query, options?.userCity);

  const cached = intentCache.get(key);

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {

    return cached.intent;

  }



  if (isClientGeminiAvailable()) {

    try {

      const normalized = await clientAnalyzeSearchIntent({

        query,

        userCity: options?.userCity,

      });

      const resolved = mergeWithGeoFallback(

        geminiToResolved(normalized, query),

        query

      );

      cacheIntent(key, resolved);

      return resolved;

    } catch (e) {

      console.warn("[search-intent] client Gemini failed:", e);

    }

  }



  if (isAiProxyAvailable()) {

    try {

      const remote = await apiAnalyzeSearchIntent({

        query,

        userCity: options?.userCity,

      });

      const normalized = normalizeGeminiPayload(remote);

      if (normalized) {

        const resolved = mergeWithGeoFallback(

          geminiToResolved(normalized, query),

          query

        );

        cacheIntent(key, resolved);

        return resolved;

      }

    } catch (e) {

      console.warn("[search-intent] server Gemini proxy failed:", e);

    }

  }



  if (!isClientGeminiAvailable() && !isAiProxyAvailable()) {

    const fallback = parseSearchIntentFallback(query);

    const resolved: ResolvedSearchIntent = {

      cleanQuery: fallback.cleanQuery,

      cityNominative: fallback.cityNominative,

      radiusKm: fallback.radiusKm,

      condition: fallback.condition,

      source: "fallback",

    };

    cacheIntent(key, resolved);

    return resolved;

  }



  throw new Error("Gemini paieškos intent nepasiekiamas");

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

export interface GeminiVisualSearchIntent {
  objectType: string;
  category: GeminiSearchCategoryLabel;
  cleanQuery: string;
  location: string;
  radiusKm: number | null;
  condition: "used" | "new" | null;
  confidence: number;
  visualSummary: string;
  searchFilters: VisualSearchFilters;
  listingCategory?: ListingCategory;
}

export interface ResolvedVisualSearchIntent {
  cleanQuery: string;
  category?: ListingCategory;
  cityNominative?: string;
  radiusKm?: number;
  condition?: "used" | "new";
  categoryAttributes: CategoryAttributeFilters;
  agentFilters: AgentSearchFilters;
  visualSummary: string;
  confidence: number;
  objectType: string;
  searchFilters: VisualSearchFilters;
  source: "gemini" | "fallback";
}

function normalizeVisualSearchFilters(raw: unknown): VisualSearchFilters {
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

function normalizeVisualPayload(raw: unknown): GeminiVisualSearchIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const categoryRaw = r.category;
  const category =
    categoryRaw === null || categoryRaw === undefined || categoryRaw === "null"
      ? null
      : VALID_CATEGORIES.has(String(categoryRaw))
        ? (String(categoryRaw) as Exclude<GeminiSearchCategoryLabel, null>)
        : null;
  const searchFilters = normalizeVisualSearchFilters(r.searchFilters);
  const cleanQuery = String(r.cleanQuery ?? "").trim();
  if (!cleanQuery && !category && !Object.keys(searchFilters).length) return null;
  const listingCategory = category ? CATEGORY_MAP[category] : undefined;
  return {
    objectType: String(r.objectType ?? "other").trim() || "other",
    category,
    listingCategory,
    cleanQuery,
    location: String(r.location ?? "").trim(),
    radiusKm: normalizeRadius(r.radiusKm) ?? null,
    condition:
      r.condition === "used" || r.condition === "new" ? r.condition : null,
    confidence: Math.min(1, Math.max(0, Number(r.confidence) || 0.5)),
    visualSummary: String(r.visualSummary ?? cleanQuery).trim(),
    searchFilters,
  };
}

function visualFiltersToCategoryAttributes(
  category: ListingCategory | undefined,
  filters: VisualSearchFilters
): CategoryAttributeFilters {
  if (!category) return {};
  const attrs: CategoryAttributeFilters = {};
  if (category === "vehicles") {
    if (filters.bodyType) attrs.bodyType = filters.bodyType;
    if (filters.fuelType) attrs.fuelType = filters.fuelType;
  } else if (category === "real_estate") {
    if (filters.propertyType) attrs.propertyType = filters.propertyType;
    if (filters.rooms) attrs.rooms = filters.rooms;
    if (filters.furnishing) attrs.furnishing = filters.furnishing;
    if (filters.transactionType) attrs.transactionType = filters.transactionType;
  } else if (category === "clothing") {
    if (filters.color) attrs.color = filters.color;
    if (filters.brand) attrs.brand = filters.brand;
    if (filters.size) attrs.size = filters.size;
    if (filters.clothingType) attrs.clothingType = filters.clothingType;
  }
  return attrs;
}

function visualToResolved(gemini: GeminiVisualSearchIntent): ResolvedVisualSearchIntent {
  const category = gemini.listingCategory ?? (gemini.category ? CATEGORY_MAP[gemini.category] : undefined);
  const categoryAttributes = visualFiltersToCategoryAttributes(category, gemini.searchFilters);
  const agentFilters: AgentSearchFilters = {
    query: gemini.cleanQuery || undefined,
    category,
    city: gemini.location || undefined,
    radiusKm: gemini.radiusKm ?? undefined,
    condition: gemini.condition ?? undefined,
  };
  return {
    cleanQuery: gemini.cleanQuery,
    category,
    cityNominative: gemini.location || undefined,
    radiusKm: gemini.radiusKm ?? undefined,
    condition: gemini.condition ?? undefined,
    categoryAttributes,
    agentFilters,
    visualSummary: gemini.visualSummary,
    confidence: gemini.confidence,
    objectType: gemini.objectType,
    searchFilters: gemini.searchFilters,
    source: "gemini",
  };
}

function declineLithuanian(count: number, singular: string, plural: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return singular;
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 11 || mod100 > 19)) return plural;
  return plural;
}

/** Sekretoriaus komentaras po foto paieškos — TTS arba toast. */
export function buildVisualSearchSecretaryComment(
  userName: string | undefined,
  intent: ResolvedVisualSearchIntent,
  resultCount: number
): string {
  const firstName = userName?.trim().split(/\s+/)[0]?.replace(/\.$/, "") || "drauge";
  const region = intent.cityNominative?.trim() || "Lietuva";
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

export function mergeVisualIntentIntoMarketplaceFilters(
  current: MarketplaceFilterState,
  intent: ResolvedVisualSearchIntent
): MarketplaceFilterState {
  const merged = mergeAgentIntoMarketplaceFilters(current, intent.agentFilters, {
    resetAbsentGeo: true,
    resetAbsentCondition: true,
  });
  return normalizeMarketplaceFilters({
    ...merged,
    categoryAttributes: {
      ...EMPTY_CATEGORY_ATTRIBUTE_FILTERS,
      ...intent.categoryAttributes,
    },
  });
}

/**
 * Resolve buyer visual search intent — browser Gemini Vision first,
 * then server proxy (JSON or multipart/form-data).
 */
export async function resolveVisualSearchIntent(
  imageDataUrl: string,
  options?: { userCity?: string; userName?: string; extraContext?: string }
): Promise<ResolvedVisualSearchIntent | null> {
  if (isClientGeminiAvailable()) {
    try {
      const normalized = await clientAnalyzeVisualSearchIntent({
        imageDataUrl,
        userCity: options?.userCity,
        extraContext: options?.extraContext,
      });
      const payload = normalizeVisualPayload(normalized);
      if (payload) return visualToResolved(payload);
    } catch (e) {
      console.warn("[visual-search-intent] client Gemini failed:", e);
    }
  }

  if (isAiProxyAvailable()) {
    try {
      const remote = await apiAnalyzeVisualSearchIntent({
        imageDataUrl,
        userCity: options?.userCity,
        userName: options?.userName,
        extraContext: options?.extraContext,
      });
      const payload = normalizeVisualPayload(remote);
      if (payload) return visualToResolved(payload);
    } catch (e) {
      console.warn("[visual-search-intent] server Gemini proxy failed:", e);
    }
  }

  return null;
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

/** Filtruoja skelbimus pagal Vision intent + marketplace filtrus (kategorija, geo, atributai, tekstas). */
export function filterListingsByVisualIntent(
  listings: Listing[],
  intent: ResolvedVisualSearchIntent,
  filters: MarketplaceFilterState,
  buyerCoords?: UserCoords | null
): Listing[] {
  const base = listings.filter((l) => l.price > 0 && !l.banned);
  const scored = base as ScoredListing[];
  let filtered = applyMarketplaceFilters(scored, filters, buyerCoords ?? null);

  if (intent.cleanQuery.trim()) {
    filtered = filtered.filter((l) => {
      if (!listingMatchesStrictBrandQuery(l, intent.cleanQuery)) return false;
      const haystack =
        `${l.title} ${l.description ?? ""} ${l.category} ${(l.tags ?? []).join(" ")} ${String(l.attributes?.make ?? "")} ${String(l.attributes?.color ?? "")}`.toLowerCase();
      return matchesProductTokens(haystack, intent.cleanQuery.toLowerCase());
    });
  }

  const category = intent.category ?? filters.category;
  if (category && category !== "all" && Object.keys(intent.categoryAttributes).length) {
    filtered = applyCategoryAttributeFilters(
      filtered,
      category,
      intent.categoryAttributes
    );
  }

  return filtered;
}

