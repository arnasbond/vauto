import { apiAnalyzeWardrobePhoto } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import type { AiExtractedListing } from "@/lib/types";
import { formatFashionCategory, FASHION_CATEGORY_ATTR } from "@/lib/clothing-catalog";

export interface WardrobeDraftItem {
  id: string;
  title: string;
  categoryGroup: string;
  categorySub: string;
  size: string;
  color: string;
  brand: string;
  condition: string;
  suggestedPrice: number;
  description: string;
  descriptionVariants?: AiExtractedListing["descriptionVariants"];
}

export interface WardrobeVisionAnalysis {
  items: WardrobeDraftItem[];
  voiceAnnouncement: string;
}

export function wardrobeItemToDraft(
  item: WardrobeDraftItem,
  contact: string,
  location: string
): AiExtractedListing {
  return {
    title: item.title,
    price: item.suggestedPrice,
    location,
    contact,
    category: "clothing",
    confidence: 0.9,
    description: item.description,
    descriptionVariants: item.descriptionVariants,
    selectedPersona: "youth",
    attributes: {
      [FASHION_CATEGORY_ATTR]: formatFashionCategory(item.categoryGroup, item.categorySub),
      clothingType: item.categoryGroup,
      size: item.size,
      color: item.color,
      colors: [item.color],
      brand: item.brand,
      condition: item.condition,
    },
  };
}

export async function analyzeWardrobePhoto(params: {
  imageDataUrl: string;
  userName?: string;
}): Promise<WardrobeVisionAnalysis | null> {
  if (isAiProxyAvailable()) {
    const result = await apiAnalyzeWardrobePhoto(params);
    if (result?.items?.length) return result;
    if (result) {
      return {
        items: [],
        voiceAnnouncement:
          result.voiceAnnouncement ||
          "Nuotraukoje nematau aiškaus drabužio — įkelkite kitą nuotrauką.",
      };
    }
  }

  return {
    items: [],
    voiceAnnouncement:
      "Nuotraukoje nematau aiškaus drabužio — įkelkite kitą nuotrauką.",
  };
}
