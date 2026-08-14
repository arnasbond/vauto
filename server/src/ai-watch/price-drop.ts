/**
 * Deterministic price-drop mathematics for LISTING_PRICE_WATCH / thresholds.
 */

export type PriceDropResult = {
  dropped: boolean;
  dropPercent: number | null;
  absoluteDrop: number | null;
  reasons: string[];
};

/**
 * Price drop vs previousPrice.
 * percent = (previous - current) / previous * 100 when previous > 0.
 */
export function evaluatePriceDrop(
  currentPrice: number,
  previousPrice: number | null | undefined,
  opts?: {
    minDropPercent?: number;
    priceBelow?: number;
  }
): PriceDropResult {
  const reasons: string[] = [];
  if (!Number.isFinite(currentPrice) || currentPrice < 0) {
    return { dropped: false, dropPercent: null, absoluteDrop: null, reasons: [] };
  }

  let dropPercent: number | null = null;
  let absoluteDrop: number | null = null;
  let dropped = false;

  if (
    previousPrice != null &&
    Number.isFinite(previousPrice) &&
    previousPrice > 0 &&
    currentPrice < previousPrice
  ) {
    absoluteDrop = Math.round((previousPrice - currentPrice) * 100) / 100;
    dropPercent =
      Math.round(((previousPrice - currentPrice) / previousPrice) * 10000) / 100;
    const need = opts?.minDropPercent;
    if (need == null || dropPercent >= need) {
      dropped = true;
      reasons.push("PRICE_DROP_PERCENT");
    }
  }

  if (opts?.priceBelow != null && currentPrice <= opts.priceBelow) {
    dropped = true;
    reasons.push("PRICE_BELOW_THRESHOLD");
  }

  return { dropped, dropPercent, absoluteDrop, reasons };
}
