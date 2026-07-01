import type { AiExtractedListing } from "@/lib/types";
import {
  barcodeLookupToDraftPatch,
  type BarcodeLookupResult,
} from "@/lib/product-intelligence/barcode-lookup";
import { vehicleLookupToDraftPatch } from "@/lib/vehicle-intelligence/vehicle-lookup";
import type { VehicleLookupResult } from "@/lib/vehicle-intelligence/vehicle-lookup";

export type UnifiedDraftSource = "agent" | "seller" | "barcode" | "vehicle" | "manual";

export interface UnifiedListingDraft {
  draft: Partial<AiExtractedListing>;
  sources: UnifiedDraftSource[];
  mergedAt: number;
}

function mergeAttributes(
  a: AiExtractedListing["attributes"] | undefined,
  b: AiExtractedListing["attributes"] | undefined
): AiExtractedListing["attributes"] {
  return { ...(a ?? {}), ...(b ?? {}) };
}

/** Merge partial drafts from parallel AI paths into one conductor-owned draft */
export function mergeListingDraft(
  existing: Partial<AiExtractedListing> | null | undefined,
  patch: Partial<AiExtractedListing>,
  source: UnifiedDraftSource,
  priorSources: UnifiedDraftSource[] = []
): UnifiedListingDraft {
  const prior = existing ?? {};

  const draft: Partial<AiExtractedListing> = {
    ...prior,
    ...patch,
    title: patch.title?.trim() ? patch.title : prior.title,
    description: patch.description?.trim() ? patch.description : prior.description,
    confidence:
      patch.confidence != null
        ? Math.max(patch.confidence, prior.confidence ?? 0)
        : prior.confidence,
    attributes: mergeAttributes(prior.attributes, patch.attributes),
  };

  const sources = priorSources.includes(source)
    ? priorSources
    : [...priorSources, source];

  return {
    draft,
    sources,
    mergedAt: Date.now(),
  };
}

export function mergeBarcodeLookupDraft(
  existing: Partial<AiExtractedListing> | null | undefined,
  result: BarcodeLookupResult,
  priorSources: UnifiedDraftSource[] = []
): UnifiedListingDraft {
  return mergeListingDraft(
    existing,
    barcodeLookupToDraftPatch(
      result,
      existing
        ? {
            title: existing.title ?? "",
            description: existing.description,
            attributes: existing.attributes,
          }
        : undefined
    ),
    "barcode",
    priorSources
  );
}

export function mergeVehicleLookupDraft(
  existing: Partial<AiExtractedListing> | null | undefined,
  result: VehicleLookupResult,
  priorSources: UnifiedDraftSource[] = []
): UnifiedListingDraft {
  return mergeListingDraft(existing, vehicleLookupToDraftPatch(result), "vehicle", priorSources);
}
