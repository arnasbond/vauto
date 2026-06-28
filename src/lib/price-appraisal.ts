import { apiPriceAppraisal } from "@/lib/api/client";
import type { PriceAdvice } from "@/lib/price-advisor";
import type { AiExtractedListing } from "@/lib/types";

export interface PriceAppraisalResult {
  minPrice: number;
  maxPrice: number;
  optimalPrice: number;
  appraisalScore: number;
  sampleSize: number;
  minNegotiationPrice: number;
  message: string;
  source: "history" | "live" | "vision";
}

export function appraisalToPriceAdvice(
  appraisal: PriceAppraisalResult,
  draftPrice: number
): PriceAdvice {
  const ratio =
    draftPrice > 0 && appraisal.optimalPrice > 0
      ? draftPrice / appraisal.optimalPrice
      : 1;
  let verdict: PriceAdvice["verdict"] = "fair";
  if (ratio < 0.85) verdict = "low";
  else if (ratio > 1.15) verdict = "high";

  return {
    verdict,
    message: appraisal.message,
    minPrice: appraisal.minPrice,
    maxPrice: appraisal.maxPrice,
    medianPrice: appraisal.optimalPrice,
    optimalPrice: appraisal.optimalPrice,
    appraisalScore: appraisal.appraisalScore,
    minNegotiationPrice: appraisal.minNegotiationPrice,
    sampleSize: appraisal.sampleSize,
    source: "appraisal",
  };
}

export function buildImageMetadataFromDraft(
  draft: AiExtractedListing
): Record<string, unknown> {
  const attrs = draft.attributes ?? {};
  return {
    title: draft.title,
    description: draft.description,
    city: draft.location,
    proposedPrice: draft.price,
    condition: attrs.condition,
    brand: attrs.brand ?? attrs.make,
    make: attrs.make,
    model: attrs.model,
    year: attrs.year,
    color: attrs.color,
    attributes: attrs,
  };
}

export async function fetchListingPriceAppraisal(
  draft: AiExtractedListing
): Promise<PriceAppraisalResult | null> {
  return apiPriceAppraisal({
    category: draft.category,
    imageMetadata: buildImageMetadataFromDraft(draft),
  });
}
