import type { PhotoVisionSearchResult } from "@/lib/photo-vision-search";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";

/** Maps Gemini Vision search result → agent grid action (updateUIFilters / search). */
export function buildVisionSearchAgentAction(
  vision: PhotoVisionSearchResult,
  listingIds: string[],
  options?: { wardrobeOnly?: boolean; label?: string }
): VautoAgentAction {
  const query = vision.intent.cleanQuery || vision.keywords;
  const categoryAttributes = vision.intent.categoryAttributes ?? {};
  const filters = {
    query,
    category: vision.intent.category ?? vision.category,
    city: vision.intent.cityNominative,
    categoryAttributes: Object.keys(categoryAttributes).length
      ? categoryAttributes
      : undefined,
  };

  const label =
    options?.label ??
    (listingIds.length
      ? `Radau ${listingIds.length} panašių pagal nuotrauką.`
      : `Filtruoju pagal nuotrauką: ${query}`);

  if (listingIds.length > 0) {
    return {
      type: "search",
      searchQuery: query,
      listingIds,
      filters,
    };
  }

  return {
    type: "apply_ui_filters",
    filters,
    query,
    label,
    categoryAttributes,
    activateWardrobe:
      Boolean(options?.wardrobeOnly) || vision.category === "clothing",
  };
}
