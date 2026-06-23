import type { AiExtractedListing } from "@/lib/types";

const DRAFT_KEY = "vauto_clothing_listing_draft_v1";

export interface SavedListingDraft {
  draft: AiExtractedListing;
  previewImage: string | null;
  savedAt: string;
}

export function saveClothingListingDraft(
  draft: AiExtractedListing,
  previewImage: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SavedListingDraft = {
      draft,
      previewImage,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function loadClothingListingDraft(): SavedListingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SavedListingDraft) : null;
  } catch {
    return null;
  }
}

export function clearClothingListingDraft(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DRAFT_KEY);
}
