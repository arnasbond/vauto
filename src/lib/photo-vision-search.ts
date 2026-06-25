import { AI_VISION_FETCH_TIMEOUT_MS } from "@/lib/ai-safeguards";
import { getAiBaseUrl, isAiProxyAvailable } from "@/lib/api/config";
import { buildPhotoSearchQuery } from "@/lib/photo-search";
import { mockExtractFromImage } from "@/lib/ai-mocks";
import type { AiExtractedListing } from "@/lib/types";

export const PHOTO_SEARCH_FALLBACK_MESSAGE =
  "Nepavyko automatiškai atpažinti nuotraukos. Įveskite tekstą rankiniu būdu";

export interface PhotoVisionSearchResult {
  keywords: string;
  confidence: number;
  category?: string;
  title?: string;
}

async function postVisionApi(
  imageBase64: string,
  extraContext?: string
): Promise<PhotoVisionSearchResult | null> {
  const base = getAiBaseUrl();
  if (!base) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_VISION_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/api/search/vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64,
        extraContext,
        userCity: "Lietuva",
      }),
      signal: controller.signal,
    });

    const json = (await res.json()) as {
      ok?: boolean;
      keywords?: string;
      confidence?: number;
      category?: string;
      title?: string;
      error?: string;
    };

    if (!res.ok || !json.ok || !json.keywords?.trim()) {
      return null;
    }

    return {
      keywords: json.keywords.trim(),
      confidence: Number(json.confidence) || 0,
      category: json.category,
      title: json.title,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function keywordsFromExtracted(extracted: AiExtractedListing): PhotoVisionSearchResult {
  return {
    keywords: buildPhotoSearchQuery(extracted),
    confidence: extracted.confidence ?? 0,
    category: extracted.category,
    title: extracted.title,
  };
}

/** Vision search for photo picker — POST /api/search/vision with mock fallback. */
export async function runPhotoVisionSearch(
  imageBase64: string,
  extraContext?: string
): Promise<PhotoVisionSearchResult | null> {
  if (isAiProxyAvailable()) {
    const fromApi = await postVisionApi(imageBase64, extraContext);
    if (fromApi) return fromApi;
  }

  try {
    const extracted = await mockExtractFromImage(undefined, imageBase64);
    if (!extracted) return null;
    return keywordsFromExtracted(extracted);
  } catch {
    return null;
  }
}
