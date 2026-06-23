import type { AiExtractedListing } from "@/lib/types";

const CLOTHING_DRAFT_KEY = "vauto_clothing_listing_draft_v1";
const GENERAL_DRAFT_KEY = "vauto_general_listing_draft_v1";

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
    localStorage.setItem(CLOTHING_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function loadClothingListingDraft(): SavedListingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CLOTHING_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SavedListingDraft) : null;
  } catch {
    return null;
  }
}

export function clearClothingListingDraft(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CLOTHING_DRAFT_KEY);
}

export function saveGeneralListingDraft(
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
    localStorage.setItem(GENERAL_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function loadGeneralListingDraft(): SavedListingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GENERAL_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SavedListingDraft) : null;
  } catch {
    return null;
  }
}

export function clearGeneralListingDraft(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GENERAL_DRAFT_KEY);
}
