import type { Listing } from "@/lib/types";

/**
 * Additive feed boost when a listing's price sits near AI/market optimal.
 * Peak ~0.08 within ±15% of appraisal optimal; 0 when no appraisal data.
 * Does not change weight tables — same pattern as visibilityBoostScore.
 */
export function computePriceFitBoost(
  listing: Pick<Listing, "price" | "attributes">
): number {
  const attrs = listing.attributes ?? {};
  const optimal = Number(
    attrs.appraisalOptimalPrice ??
      attrs.optimalPrice ??
      attrs.marketMedianPrice ??
      0
  );
  const price = Number(listing.price ?? 0);
  if (!(optimal > 0) || !(price > 0)) return 0;

  const ratio = price / optimal;
  let fit = 0;
  if (ratio >= 0.85 && ratio <= 1.15) fit = 0.08;
  else if (ratio >= 0.7 && ratio <= 1.3) fit = 0.04;
  else if (ratio >= 0.55 && ratio <= 1.5) fit = 0.015;
  else return 0;

  const score = Number(attrs.appraisalScore ?? 0);
  const confidence = score > 0 ? Math.min(1, Math.max(0.35, score / 100)) : 0.6;
  return fit * confidence;
}

/** Persist appraisal onto draft attributes for ranking + PrePublish reuse. */
export function appraisalAttrsForDraft(appraisal: {
  minPrice: number;
  maxPrice: number;
  optimalPrice: number;
  appraisalScore: number;
  sampleSize: number;
  minNegotiationPrice?: number;
}): Record<string, string> {
  return {
    appraisalMinPrice: String(Math.round(appraisal.minPrice)),
    appraisalMaxPrice: String(Math.round(appraisal.maxPrice)),
    appraisalOptimalPrice: String(Math.round(appraisal.optimalPrice)),
    appraisalScore: String(Math.round(appraisal.appraisalScore)),
    appraisalSampleSize: String(appraisal.sampleSize),
    ...(appraisal.minNegotiationPrice != null && appraisal.minNegotiationPrice > 0
      ? {
          minNegotiationPrice: String(
            Math.round(appraisal.minNegotiationPrice)
          ),
        }
      : {}),
  };
}
