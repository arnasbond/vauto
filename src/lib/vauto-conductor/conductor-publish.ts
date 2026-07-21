import type { AiExtractedListing, Listing } from "@/lib/types";
import { getConductorDraft } from "./conductor-draft-store";
import type { UnifiedDraftSource } from "./unified-draft";

export const CONDUCTOR_SOURCES_ATTR = "conductorSources";
export const CONDUCTOR_MERGED_AT_ATTR = "conductorMergedAt";

export interface ConductorPublishSnapshot {
  draft: AiExtractedListing;
  sources: UnifiedDraftSource[];
  mergedAt: number | null;
}

/** Phase 2 bridge — attach conductor lineage to a publish-ready listing draft. */
export function buildConductorPublishSnapshot(
  draft: AiExtractedListing
): ConductorPublishSnapshot {
  const unified = getConductorDraft();
  return {
    draft,
    sources: unified?.sources ?? [],
    mergedAt: unified?.mergedAt ?? null,
  };
}

/** Stamp conductor lineage onto listing attributes before API publish. */
export function enrichListingWithConductorMeta(
  listing: Listing,
  snapshot: ConductorPublishSnapshot
): Listing {
  if (!snapshot.sources.length) return listing;
  return {
    ...listing,
    attributes: {
      ...(listing.attributes ?? {}),
      [CONDUCTOR_SOURCES_ATTR]: snapshot.sources.join(","),
      ...(snapshot.mergedAt != null
        ? { [CONDUCTOR_MERGED_AT_ATTR]: String(snapshot.mergedAt) }
        : {}),
    },
  };
}

/**
 * Agent / seller / barcode / vehicle publishes go live immediately on the public feed.
 * Human review is opt-in only via explicit `draft.requiresReview === true` (anti-fraud).
 */
export function resolveConductorRequiresReview(
  snapshot: ConductorPublishSnapshot
): boolean {
  void snapshot;
  return false;
}

/** Apply explicit anti-fraud review flag only — never auto-hide agent publishes. */
export function resolveListingRequiresReview(
  draft: AiExtractedListing,
  snapshot: ConductorPublishSnapshot
): boolean {
  void snapshot;
  return draft.requiresReview === true;
}
