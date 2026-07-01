import type { AiExtractedListing } from "@/lib/types";
import { getConductorDraft } from "./conductor-draft-store";
import type { UnifiedDraftSource } from "./unified-draft";

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
