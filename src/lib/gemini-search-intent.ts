import { apiAnalyzeSearchIntent } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import {
  clientAnalyzeSearchIntent,
  isClientGeminiAvailable,
} from "@/lib/gemini-browser";
import type { ListingCategory } from "@/lib/types";
import { snapRadiusKm } from "@/lib/marketplace-view";
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
