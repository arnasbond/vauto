import type { ListingCategory } from "@/lib/types";
import { MOCK_CATEGORY_LABELS } from "@/data/mockListings";
import type { VisualPipelinePayload } from "@/lib/visual-pipeline-merge";
import type { ResolvedVisualSearchIntent } from "@/lib/gemini-search-intent";

export const PHOTO_INTENT_SEARCH_CHIP = "🔍 Ieškoti šio daikto";
export const PHOTO_INTENT_LISTING_CHIP = "➕ Įkelti skelbimą";

export const PHOTO_INTENT_QUICK_REPLIES = [
  PHOTO_INTENT_SEARCH_CHIP,
  PHOTO_INTENT_LISTING_CHIP,
] as const;

export type PhotoIntentPhase = "intent_resolution" | "multi_object";

export interface PhotoIntentAnalysis {
  ok: boolean;
  phase: PhotoIntentPhase;
  objectLabel: string;
  categoryLabel: string;
  category: ListingCategory;
  confidence: number;
  orderedImageUrls: string[];
  extraContext?: string;
  visualPipeline?: VisualPipelinePayload;
  visionIntent?: ResolvedVisualSearchIntent;
  choiceChips?: string[];
  clarificationPrompt?: string;
}

export interface PendingPhotoIntent {
  photos: string[];
  extraContext?: string;
  analysis: PhotoIntentAnalysis;
  wardrobeOnly?: boolean;
}

export function listingCategoryLabel(category: ListingCategory | string | null | undefined): string {
  if (!category) return "daiktą";
  return MOCK_CATEGORY_LABELS[category as ListingCategory] ?? String(category);
}

export function buildPhotoIntentPrompt(objectLabel: string, categoryLabel: string): string {
  const label = objectLabel.trim() || categoryLabel.trim() || "objektą";
  const categoryHint =
    categoryLabel.trim() && !label.toLowerCase().includes(categoryLabel.toLowerCase())
      ? ` (${categoryLabel})`
      : "";
  return `Matau ${label}${categoryHint}. Ką norėtumėte daryti?`;
}

function normalizeChip(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isPhotoIntentSearchChip(text: string): boolean {
  const n = normalizeChip(text);
  return (
    n === normalizeChip(PHOTO_INTENT_SEARCH_CHIP) ||
    /^🔍?\s*ieškoti/.test(n) ||
    n === "ieškoti šio daikto"
  );
}

export function isPhotoIntentListingChip(text: string): boolean {
  const n = normalizeChip(text);
  return (
    n === normalizeChip(PHOTO_INTENT_LISTING_CHIP) ||
    /^➕?\s*įkelti skelbim/.test(n) ||
    n === "įkelti skelbimą" ||
    n === "parduoti" ||
    n === "skelbti"
  );
}
