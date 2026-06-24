import type { MarketPriceAnalysisResult } from "./market-price-analysis.js";

const PRICE_ABOVE_MARKET_RATIO = 1.05;

export function buildProactivePricingMessage(
  draftPrice: number,
  analysis: MarketPriceAnalysisResult,
  itemLabel?: string
): string | null {
  const median = analysis.medianPrice;
  if (!median || draftPrice <= 0) return null;
  if (draftPrice <= median * PRICE_ABOVE_MARKET_RATIO) return null;

  const label = itemLabel?.trim() || "šio modelio";
  return `Užregistravau juodraštį už ${draftPrice} €. Pastebėjau, kad vidutinė ${label} kaina platformoje yra ${median} €. Ar norėtumėte pakoreguoti kainą, kad skelbimas sulauktų daugiau dėmesio?`;
}

export function buildProactiveSearchResetMessage(
  searchSummary?: string,
  searchQuery?: string
): string {
  let tail = searchSummary?.trim();
  if (!tail && searchQuery?.trim()) {
    tail = `Štai ${searchQuery.trim()}.`;
  }
  if (!tail) tail = "Štai atnaujinti rezultatai.";
  return `Senus paieškos kriterijus išvaliau. ${tail}`;
}
