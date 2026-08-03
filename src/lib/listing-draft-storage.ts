import type { AiExtractedListing } from "@/lib/types";
import {
  ensureClientDraftId,
  readClientDraftId,
} from "@/lib/listing-draft-id";

const CLOTHING_DRAFT_KEY = "vauto_clothing_listing_draft_v1";
const GENERAL_DRAFT_KEY = "vauto_general_listing_draft_v1";
const JOB_DRAFT_KEY = "vauto_job_listing_draft_v1";
const SERVICE_DRAFT_KEY = "vauto_service_listing_draft_v1";
/** Phase B light — up to 3 concurrent seller drafts (local only). */
const MULTI_DRAFT_KEY = "vauto_multi_listing_drafts_v1";
export const MAX_MULTI_LISTING_DRAFTS = 3;

export interface SavedListingDraft {
  draft: AiExtractedListing;
  previewImage: string | null;
  savedAt: string;
}

export interface MultiListingDraftEntry extends SavedListingDraft {
  id: string;
}

function readMultiRaw(): MultiListingDraftEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MULTI_DRAFT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is MultiListingDraftEntry =>
          Boolean(
            row &&
              typeof row === "object" &&
              typeof (row as MultiListingDraftEntry).id === "string" &&
              (row as MultiListingDraftEntry).draft &&
              typeof (row as MultiListingDraftEntry).savedAt === "string"
          )
      )
      .slice(0, MAX_MULTI_LISTING_DRAFTS);
  } catch {
    return [];
  }
}

function writeMultiRaw(entries: MultiListingDraftEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      MULTI_DRAFT_KEY,
      JSON.stringify(entries.slice(0, MAX_MULTI_LISTING_DRAFTS))
    );
  } catch {
    /* quota */
  }
}

/** List newest-first concurrent drafts (max 3). */
export function listMultiListingDrafts(): MultiListingDraftEntry[] {
  return readMultiRaw().sort((a, b) =>
    a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0
  );
}

/**
 * Upsert a draft by clientDraftId. Caps at MAX_MULTI_LISTING_DRAFTS
 * (drops oldest when adding a new id).
 */
export function upsertMultiListingDraft(
  draft: AiExtractedListing,
  previewImage: string | null
): MultiListingDraftEntry | null {
  if (typeof window === "undefined") return null;
  const withId = ensureClientDraftId(draft);
  const id = readClientDraftId(withId.attributes);
  if (!id || !withId.title?.trim()) return null;
  const entry: MultiListingDraftEntry = {
    id,
    draft: withId,
    previewImage,
    savedAt: new Date().toISOString(),
  };
  const prev = readMultiRaw().filter((row) => row.id !== id);
  const next = [entry, ...prev]
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0))
    .slice(0, MAX_MULTI_LISTING_DRAFTS);
  writeMultiRaw(next);
  return entry;
}

export function removeMultiListingDraft(id: string | null | undefined): void {
  if (typeof window === "undefined" || !id?.trim()) return;
  writeMultiRaw(readMultiRaw().filter((row) => row.id !== id.trim()));
}

export function clearMultiListingDrafts(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MULTI_DRAFT_KEY);
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

export function saveJobListingDraft(
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
    localStorage.setItem(JOB_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function clearJobListingDraft(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(JOB_DRAFT_KEY);
}

export function saveServiceListingDraft(
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
    localStorage.setItem(SERVICE_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function loadServiceListingDraft(): SavedListingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SERVICE_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SavedListingDraft) : null;
  } catch {
    return null;
  }
}

export function clearServiceListingDraft(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SERVICE_DRAFT_KEY);
}

/** Wipe all local listing draft caches — hard session purge (publish / new listing). */
export function clearAllListingDrafts(): void {
  clearClothingListingDraft();
  clearGeneralListingDraft();
  clearJobListingDraft();
  clearServiceListingDraft();
  clearMultiListingDrafts();
}
