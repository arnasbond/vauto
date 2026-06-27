import type { AiExtractedListing } from "@/lib/types";

const GUEST_DRAFTS_KEY = "vauto_guest_wardrobe_drafts";

export function saveGuestWardrobeDrafts(drafts: AiExtractedListing[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(GUEST_DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    /* ignore quota */
  }
}

export function loadGuestWardrobeDrafts(): AiExtractedListing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(GUEST_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AiExtractedListing[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearGuestWardrobeDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(GUEST_DRAFTS_KEY);
  } catch {
    /* ignore */
  }
}

export function isGuestUserId(userId: string | undefined): boolean {
  return !userId || userId === "guest";
}
