import type { Listing } from "@/lib/types";
import { readClientDraftId } from "@/lib/listing-draft-id";

function normalize(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
}

export type DuplicateListingCheckOpts = {
  /** Current AI session draft id — never treat same-session draft as a dup of itself. */
  clientDraftId?: string | null;
  /** Soft skeleton / freshly generated AI titles should not false-positive against catalog. */
  skipSoftAiDraft?: boolean;
};

/** Soft placeholder titles from sparse sell clarify — not real catalog spam. */
function isSoftAiSkeletonTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return true;
  return /^(naujas skelbimas|parduodamas?\s+\w{0,24}|paveikslas|prekė|preke|drabužių skelbimas)$/i.test(
    t
  );
}

/** Simple title similarity — blocks obvious spam duplicates from same seller */
export function isDuplicateListing(
  title: string,
  sellerId: string,
  listings: Listing[],
  opts?: DuplicateListingCheckOpts
): boolean {
  const norm = normalize(title);
  if (norm.length < 4) return false;
  if (opts?.skipSoftAiDraft && isSoftAiSkeletonTitle(title)) return false;

  const selfDraftId = opts?.clientDraftId?.trim() || "";

  return listings.some((l) => {
    if (l.sellerId !== sellerId) return false;
    if (selfDraftId) {
      const otherDraftId = readClientDraftId(l.attributes);
      if (otherDraftId && otherDraftId === selfDraftId) return false;
    }
    // Same listing id (re-publish / edit path) is not a duplicate spam hit.
    if (selfDraftId && l.id && l.id.includes(selfDraftId.replace(/^cd-/, ""))) {
      return false;
    }
    const other = normalize(l.title);
    if (other === norm) return true;
    if (other.includes(norm) || norm.includes(other)) {
      return Math.min(norm.length, other.length) / Math.max(norm.length, other.length) > 0.75;
    }
    return false;
  });
}
