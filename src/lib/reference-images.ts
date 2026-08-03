import { apiReferenceImages } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import { LISTING_PLACEHOLDER_IMAGE } from "@/lib/listing-image";

/**
 * Reference / inspiration images for AI UI — never Unsplash stock.
 * Prefer API results; otherwise return neutral placeholders only.
 */
export async function searchReferenceImages(
  query: string,
  category?: string,
  limit = 4
): Promise<string[]> {
  if (isAiProxyAvailable()) {
    const remote = await apiReferenceImages({ query, category, limit });
    const cleaned = (remote ?? []).filter(
      (u) =>
        typeof u === "string" &&
        /^https?:\/\//i.test(u) &&
        !/unsplash\.com|picsum\.photos/i.test(u)
    );
    if (cleaned.length) return cleaned.slice(0, limit);
  }

  return Array.from({ length: Math.min(limit, 1) }, () => LISTING_PLACEHOLDER_IMAGE);
}
