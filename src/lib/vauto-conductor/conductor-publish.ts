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

const AUTOMATED_SOURCES: UnifiedDraftSource[] = ["seller", "barcode", "agent", "vehicle"];

/** AI-assisted listings without manual override → queue for human review. */
export function resolveConductorRequiresReview(
  snapshot: ConductorPublishSnapshot
): boolean {
  const { sources } = snapshot;
  if (!sources.length) return false;
  if (sources.length === 1 && sources[0] === "manual") return false;
  const hasAutomated = sources.some((s) => AUTOMATED_SOURCES.includes(s));
  const hasManual = sources.includes("manual");
  return hasAutomated && !hasManual;
}

/** Apply conductor review flag unless vision/anti-fraud already set it. */
export function resolveListingRequiresReview(
  draft: AiExtractedListing,
  snapshot: ConductorPublishSnapshot
): boolean {
  if (draft.requiresReview === true) return true;
  return resolveConductorRequiresReview(snapshot);
}
