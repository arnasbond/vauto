import type { AiExtractedListing } from "@/lib/types";
import {
  mergeListingDraft,
  type UnifiedDraftSource,
  type UnifiedListingDraft,
} from "./unified-draft";

let conductorDraft: UnifiedListingDraft | null = null;

/** Read the conductor-owned unified draft (session-scoped). */
export function getConductorDraft(): UnifiedListingDraft | null {
  return conductorDraft;
}

/** Replace store wholesale (e.g. after external finalize). */
export function adoptConductorDraft(unified: UnifiedListingDraft): void {
  conductorDraft = unified;
}

/**
 * Merge a patch into the conductor draft.
 * @param base When provided, overrides the stored draft as merge base (`null` = fresh).
 */
export function commitConductorDraft(
  patch: Partial<AiExtractedListing>,
  source: UnifiedDraftSource,
  base?: Partial<AiExtractedListing> | null
): UnifiedListingDraft {
  const useExplicitBase = base !== undefined;
  const existingDraft = useExplicitBase ? base : conductorDraft?.draft;
  const existingSources = useExplicitBase && base === null ? [] : (conductorDraft?.sources ?? []);
  const unified = mergeListingDraft(existingDraft, patch, source, existingSources);
  conductorDraft = unified;
  return unified;
}

export function resetConductorDraft(): void {
  conductorDraft = null;
}
