import { AI_VISION_FETCH_TIMEOUT_MS } from "@/lib/ai-safeguards";

import { getDataApiBaseUrl, initDataApiConfig } from "@/lib/api/config";

import { buildPhotoSearchQuery } from "@/lib/photo-search";

import { mockExtractFromImage } from "@/lib/ai-mocks";
import { shouldUseOfflineAiMocks } from "@/lib/ai-pipeline";

import {

  clientExtractListingFromImage,

  isClientGeminiAvailable,

} from "@/lib/gemini-browser";

import {

  buildVisualSearchSecretaryComment,

  filterListingsByVisualIntent,

  mergeVisualIntentIntoMarketplaceFilters,

  resolveVisualSearchIntent,

  type ResolvedVisualSearchIntent,

} from "@/lib/gemini-search-intent";

import { compressForAiVision } from "@/lib/native-media";

import type { Listing, ListingCategory } from "@/lib/types";

import type { MarketplaceFilterState } from "@/lib/marketplace-view";



export const PHOTO_SEARCH_FALLBACK_MESSAGE =
  "Nuotrauka ne visai aiški — pabandykite geresnį apšvietimą arba tiesiog parašykite, ką ieškote, ir padėsiu toliau.";



export interface PhotoVisionSearchResult {

  intent: ResolvedVisualSearchIntent;

  keywords: string;

  confidence: number;

  category?: ListingCategory;

  title?: string;

}



const RENDER_VISION_FALLBACK =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? null;



async function resolveVisionApiUrls(): Promise<string[]> {

  await initDataApiConfig();

  const urls: string[] = [];

  if (typeof window !== "undefined") {

    urls.push(`${window.location.origin}/api/search/vision`);

  }

  const apiBase = getDataApiBaseUrl();

  if (apiBase) {
    urls.push(`${apiBase.replace(/\/$/, "")}/api/search/vision`);
  }

  if (RENDER_VISION_FALLBACK) {
    urls.push(`${RENDER_VISION_FALLBACK}/api/search/vision`);
  }

  return [...new Set(urls)];

}



function normalizeVisionImagePayload(imageBase64: string): string {

  const trimmed = imageBase64.trim();

  if (!trimmed) return trimmed;

  if (trimmed.startsWith("data:")) return trimmed;

  return `data:image/jpeg;base64,${trimmed.replace(/\s/g, "")}`;

}



async function postVisionApi(

  imageBase64: string,

  extraContext?: string,

  userCity?: string

): Promise<PhotoVisionSearchResult | null> {

  const payload = {

    imageBase64: normalizeVisionImagePayload(imageBase64),

    extraContext,

    userCity: userCity ?? "Lietuva",

  };



  const urls = await resolveVisionApiUrls();



  for (const url of urls) {

    const controller = new AbortController();

    const timer = setTimeout(() => controller.abort(), AI_VISION_FETCH_TIMEOUT_MS);



    try {

      const res = await fetch(url, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(payload),

        signal: controller.signal,

      });



      const json = (await res.json()) as {

        ok?: boolean;

        keywords?: string;

        confidence?: number;

        category?: string;

        title?: string;

        searchFilters?: Record<string, string>;

        location?: string;

        sceneContext?: string;

        choiceChips?: string[];

        semanticAlternatives?: string[];

        clarificationPrompt?: string;

        qualityHint?: string;

        imageQuality?: string;

        needsClarification?: boolean;

        error?: string;

      };



      if (!res.ok || !json.ok || !json.keywords?.trim()) {

        continue;

      }



      const category = (json.category as ListingCategory | undefined) ?? undefined;

      const searchFilters = json.searchFilters ?? {};

      const intent: ResolvedVisualSearchIntent = {

        cleanQuery: json.keywords.trim(),

        category,

        cityNominative: json.location?.trim() || userCity,

        categoryAttributes: {

          ...(searchFilters.bodyType ? { bodyType: searchFilters.bodyType } : {}),

          ...(searchFilters.fuelType ? { fuelType: searchFilters.fuelType } : {}),

          ...(searchFilters.color ? { color: searchFilters.color } : {}),

          ...(searchFilters.propertyType ? { propertyType: searchFilters.propertyType } : {}),

          ...(searchFilters.rooms ? { rooms: searchFilters.rooms } : {}),

          ...(searchFilters.furnishing ? { furnishing: searchFilters.furnishing } : {}),

          ...(searchFilters.brand ? { brand: searchFilters.brand } : {}),

        },

        agentFilters: {

          query: json.keywords.trim(),

          category,

          city: json.location?.trim() || userCity,

        },

        visualSummary: json.title ?? json.keywords.trim(),

        confidence: Number(json.confidence) || 0,

        objectType: category ?? "other",

        searchFilters,

        source: "gemini",

        sceneContext: json.sceneContext,

        choiceChips: json.choiceChips,

        semanticAlternatives: json.semanticAlternatives,

        clarificationPrompt: json.clarificationPrompt || json.qualityHint,

      };



      return {

        intent,

        keywords: json.keywords.trim(),

        confidence: intent.confidence,

        category,

        title: json.title,

      };

    } catch {

      /* try next endpoint */

    } finally {

      clearTimeout(timer);

    }

  }



  return null;

}



function keywordsFromLegacyExtract(extracted: import("@/lib/types").AiExtractedListing): PhotoVisionSearchResult {

  const keywords = buildPhotoSearchQuery(extracted);

  const intent: ResolvedVisualSearchIntent = {

    cleanQuery: keywords,

    category: extracted.category,

    cityNominative: extracted.location,

    categoryAttributes: {},

    agentFilters: {

      query: keywords,

      category: extracted.category,

    },

    visualSummary: extracted.title ?? keywords,

    confidence: extracted.confidence ?? 0,

    objectType: extracted.category ?? "other",

    searchFilters: {},

    source: "fallback",

  };

  return {

    intent,

    keywords,

    confidence: intent.confidence,

    category: extracted.category,

    title: extracted.title,

  };

}



/** Vision search — structured intent (Gemini Vision) → searchFilters + DB filtravimas. */

export async function runPhotoVisionSearch(

  imageBase64: string,

  options?: {

    extraContext?: string;

    userCity?: string;

    userName?: string;

    wardrobeOnly?: boolean;

  }

): Promise<PhotoVisionSearchResult | null> {

  const compressed = await compressForAiVision(imageBase64);

  const userCity = options?.userCity ?? "Lietuva";



  const fromApi = await postVisionApi(compressed, options?.extraContext, userCity);

  if (fromApi) {

    return applyWardrobeVisionScope(fromApi, options?.wardrobeOnly);

  }



  const structured = await resolveVisualSearchIntent(compressed, {

    userCity,

    userName: options?.userName,

    extraContext: options?.extraContext,

    wardrobeOnly: options?.wardrobeOnly,

  });

  if (structured && structured.confidence >= 0.35 && structured.cleanQuery.trim()) {

    return {

      intent: structured,

      keywords: structured.cleanQuery,

      confidence: structured.confidence,

      category: structured.category,

      title: structured.visualSummary,

    };

  }



  if (isClientGeminiAvailable()) {

    try {

      const extracted = await clientExtractListingFromImage({

        imageDataUrl: compressed,

        extraContext: options?.extraContext,

        userCity,

      });

      return keywordsFromLegacyExtract(extracted);

    } catch (e) {

      console.warn("[runPhotoVisionSearch] legacy client extract failed:", e);

    }

  }



  if (shouldUseOfflineAiMocks()) {

    try {

      const extracted = await mockExtractFromImage(undefined, compressed);

      if (!extracted) return null;

      const legacy = keywordsFromLegacyExtract(extracted);

      return applyWardrobeVisionScope(legacy, options?.wardrobeOnly);

    } catch {

      return null;

    }

  }



  return null;

}



function applyWardrobeVisionScope(

  result: PhotoVisionSearchResult,

  wardrobeOnly?: boolean

): PhotoVisionSearchResult {

  if (!wardrobeOnly) return result;

  return {

    ...result,

    category: "clothing",

    intent: {

      ...result.intent,

      category: "clothing",

      objectType: "clothing",

      agentFilters: {

        ...result.intent.agentFilters,

        category: "clothing",

      },

    },

  };

}



export interface VisualPhotoSearchGridResult {

  intent: ResolvedVisualSearchIntent;

  filters: MarketplaceFilterState;

  listingIds: string[];

  secretaryComment: string;

  searchQuery: string;

}



/** Pritaiko visual intent prie tinklelio — filtrai + pinned IDs + sekretoriaus komentaras. */

export function applyVisualPhotoSearchToGrid(

  vision: PhotoVisionSearchResult,

  listings: Listing[],

  marketplaceFilters: MarketplaceFilterState,

  userName?: string,

  wardrobeOnly?: boolean

): VisualPhotoSearchGridResult {

  const filters = mergeVisualIntentIntoMarketplaceFilters(

    marketplaceFilters,

    vision.intent,

    wardrobeOnly

  );

  const matched = filterListingsByVisualIntent(

    listings,

    vision.intent,

    filters,

    undefined,

    wardrobeOnly

  );

  const secretaryComment = buildVisualSearchSecretaryComment(

    userName,

    vision.intent,

    matched.length

  );

  return {

    intent: vision.intent,

    filters,

    listingIds: matched.map((l) => l.id),

    secretaryComment,

    searchQuery: vision.intent.cleanQuery || vision.keywords,

  };

}



/** Seller listing draft — map Vision API result to AiExtractedListing. */

export function mapVisionResultToListingExtract(

  vision: PhotoVisionSearchResult,

  ctx?: { userCity?: string; contact?: string; extraContext?: string }

): import("@/lib/types").AiExtractedListing {

  const attrs: Record<string, string> = {

    ...(vision.intent.categoryAttributes ?? {}),

  };

  const sf = vision.intent.searchFilters ?? {};

  if (sf.color && !attrs.color) attrs.color = String(sf.color);

  if (sf.brand && !attrs.brand) attrs.brand = String(sf.brand);

  if (sf.size && !attrs.size) attrs.size = String(sf.size);

  if (sf.bodyType && !attrs.bodyType) attrs.bodyType = String(sf.bodyType);



  const descriptionParts = [

    vision.intent.visualSummary || vision.title,

    ctx?.extraContext?.trim(),

  ].filter(Boolean);



  return {

    title: (vision.title ?? vision.keywords).slice(0, 120),

    description: descriptionParts.join(". ") || vision.keywords,

    price: 0,

    location: vision.intent.cityNominative || ctx?.userCity || "Lietuva",

    contact: ctx?.contact ?? "+370 612 34567",

    category: (vision.category as import("@/lib/types").ListingCategory) ?? "other",

    confidence: vision.confidence,

    attributes: attrs,

  };

}


