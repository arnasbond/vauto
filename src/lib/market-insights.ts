import type { Listing } from "@/lib/types";
import { formatPrice } from "@/data/mockListings";
import { getPriceAdvice, type PriceAdvice, type PriceVerdict } from "@/lib/price-advisor";
import { getSkelbiuMarketSnapshot, type MarketComparable } from "@/lib/market-pricing";
import { isVisibilityActive } from "@/lib/visibility-plans";

export type MarketPrecision = "low" | "medium" | "high";

export interface BoostTip {
  id: string;
  title: string;
  detail: string;
  urgency: "low" | "medium" | "high";
  action: "promote" | "price" | "detail" | "renew";
}

export interface MarketInsights {
  competitorCount: number;
  priceAdvice: PriceAdvice;
  precision: MarketPrecision;
  precisionScore: number;
  detailScore: number;
  scope?: "city" | "national";
  scopeLabel: string;
  topComparables: MarketComparable[];
  boostTips: BoostTip[];
  predictedVisibilityLift: string;
  pricePositionLabel: string;
}

export interface BusinessMarketOverview {
  totalCompetitors: number;
  activeListings: number;
  listingsWithData: number;
  avgPrecision: MarketPrecision;
  priceRange: { min?: number; max?: number };
  topBoostTips: BoostTip[];
  listingInsights: Array<{ listingId: string; title: string; insights: MarketInsights }>;
}

function computeDetailScore(
  listing: Pick<Listing, "title" | "description" | "tags" | "attributes" | "location">
): number {
  let score = 0;
  if ((listing.title?.trim().length ?? 0) >= 8) score += 0.2;
  if ((listing.description?.trim().length ?? 0) >= 30) score += 0.25;
  if ((listing.tags?.length ?? 0) >= 2) score += 0.15;
  const attrCount = Object.keys(listing.attributes ?? {}).length;
  if (attrCount >= 2) score += 0.25;
  else if (attrCount >= 1) score += 0.12;
  if ((listing.location?.trim().length ?? 0) >= 3) score += 0.15;
  return Math.min(1, score);
}

function precisionFromScore(score: number): MarketPrecision {
  if (score >= 0.65) return "high";
  if (score >= 0.35) return "medium";
  return "low";
}

export function precisionLabel(precision: MarketPrecision): string {
  switch (precision) {
    case "high":
      return "Aukštas tikslumas";
    case "medium":
      return "Vidutinis tikslumas";
    default:
      return "Žemas tikslumas";
  }
}

function pricePositionLabel(
  verdict: PriceVerdict,
  minPrice?: number,
  maxPrice?: number
): string {
  if (verdict === "low") return "Žemiau rinkos";
  if (verdict === "high") return "Virš rinkos";
  if (verdict === "fair" && minPrice != null && maxPrice != null) {
    return `Rinkoje ${formatPrice(minPrice)}–${formatPrice(maxPrice)}`;
  }
  return "Rinkos duomenų dar trūksta";
}

function buildBoostTips(
  listing: Listing,
  advice: PriceAdvice,
  competitorCount: number,
  precision: MarketPrecision,
  buyerIntentCount = 0
): BoostTip[] {
  const tips: BoostTip[] = [];
  const views = listing.views ?? 0;

  if (competitorCount >= 3 && !isVisibilityActive(listing)) {
    tips.push({
      id: "promote-competition",
      title: "Iškelkite skelbimą",
      detail: `${competitorCount} panašūs skelbimai — TOP pozicija padidins matomumą iki 3×.`,
      urgency: competitorCount >= 5 ? "high" : "medium",
      action: "promote",
    });
  }

  if (advice.verdict === "high" && competitorCount > 0) {
    tips.push({
      id: "price-high",
      title: "Peržiūrėkite kainą",
      detail: `Jūsų kaina viršija rinką. Sumažinus ar priartinus prie ${advice.medianPrice ? formatPrice(advice.medianPrice) : "vidurkio"} gausite daugiau užklausų.`,
      urgency: "high",
      action: "price",
    });
  }

  if (advice.verdict === "low" && competitorCount >= 2 && views < 20) {
    tips.push({
      id: "promote-good-price",
      title: "Kaina konkurencinga — reikia matomumo",
      detail: "Turite gerą kainą, bet konkurentai matomesni. Paryškinkite skelbimą, kad būtumėte siūlomi pirmiausia.",
      urgency: "medium",
      action: "promote",
    });
  }

  if (buyerIntentCount > 0 && !isVisibilityActive(listing)) {
    tips.push({
      id: "promote-demand",
      title: "Yra aktyvi paklausa",
      detail: `${buyerIntentCount} pirkėjų ieškojo panašių prekių — iškelkite dabar, kol konkurentai nepirmauja.`,
      urgency: "high",
      action: "promote",
    });
  }

  if (precision === "low") {
    tips.push({
      id: "detail-more",
      title: "Pridėkite detalių",
      detail: "Kuo tiksliau aprašysite prekę ar paslaugą (modelis, būklė, parametrai), tuo tikslesnę konkurentų analizę parodysime.",
      urgency: "medium",
      action: "detail",
    });
  }

  if (views < 5 && competitorCount > 0 && !isVisibilityActive(listing)) {
    tips.push({
      id: "promote-visibility",
      title: "Padidinkite matomumą",
      detail: "Mažai peržiūrų lyginant su rinka — paryškintas skelbimas rodomas aukščiau paieškoje.",
      urgency: "medium",
      action: "promote",
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return tips.sort((a, b) => order[a.urgency] - order[b.urgency]).slice(0, 4);
}

function predictedLift(competitorCount: number, listing: Listing): string {
  if (isVisibilityActive(listing)) return "Aktyvus matomumo planas — stebėkite peržiūras";
  if (competitorCount >= 6) return "Iki +280% matomumo TOP pozicijoje";
  if (competitorCount >= 3) return "Iki +180% matomumo iškėlimo metu";
  if (competitorCount >= 1) return "Iki +120% matomumo paryškinimui";
  return "Iki +90% matomumo naujiems skelbimams";
}

export function getMarketInsights(
  listing: Listing,
  allListings: Listing[],
  options?: { buyerIntentCount?: number }
): MarketInsights {
  const priceAdvice = getPriceAdvice(listing, allListings);
  const snapshot = getSkelbiuMarketSnapshot(listing);
  const detailScore = computeDetailScore(listing);
  const dataRichness = Math.min(1, priceAdvice.sampleSize / 6);
  const precisionScore = detailScore * 0.55 + dataRichness * 0.45;
  const precision = precisionFromScore(precisionScore);
  const competitorCount = priceAdvice.sampleSize;
  const scopeLabel =
    priceAdvice.scope === "city"
      ? snapshot.city
      : priceAdvice.scope === "national"
        ? "visoje Lietuvoje"
        : listing.location.split(",")[0]?.trim() || "regione";

  const boostTips = buildBoostTips(
    listing,
    priceAdvice,
    competitorCount,
    precision,
    options?.buyerIntentCount ?? 0
  );

  return {
    competitorCount,
    priceAdvice,
    precision,
    precisionScore,
    detailScore,
    scope: priceAdvice.scope,
    scopeLabel,
    topComparables: snapshot.comparables.slice(0, 3),
    boostTips,
    predictedVisibilityLift: predictedLift(competitorCount, listing),
    pricePositionLabel: pricePositionLabel(
      priceAdvice.verdict,
      priceAdvice.minPrice,
      priceAdvice.maxPrice
    ),
  };
}

export function getBusinessMarketOverview(
  myListings: Listing[],
  allListings: Listing[],
  buyerIntentCount = 0
): BusinessMarketOverview {
  const active = myListings.filter((l) => l.status !== "sold" && !l.banned);
  const listingInsights = active.map((listing) => ({
    listingId: listing.id,
    title: listing.title,
    insights: getMarketInsights(listing, allListings, { buyerIntentCount }),
  }));

  const withData = listingInsights.filter((i) => i.insights.competitorCount > 0);
  const totalCompetitors = withData.reduce(
    (sum, i) => sum + i.insights.competitorCount,
    0
  );

  const allMins = withData
    .map((i) => i.insights.priceAdvice.minPrice)
    .filter((p): p is number => p != null);
  const allMaxs = withData
    .map((i) => i.insights.priceAdvice.maxPrice)
    .filter((p): p is number => p != null);

  const avgPrecisionScore =
    listingInsights.length > 0
      ? listingInsights.reduce((s, i) => s + i.insights.precisionScore, 0) /
        listingInsights.length
      : 0;

  const allTips = listingInsights.flatMap((i) => i.insights.boostTips);
  const seen = new Set<string>();
  const topBoostTips = allTips.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  return {
    totalCompetitors,
    activeListings: active.length,
    listingsWithData: withData.length,
    avgPrecision: precisionFromScore(avgPrecisionScore),
    priceRange: {
      min: allMins.length ? Math.min(...allMins) : undefined,
      max: allMaxs.length ? Math.max(...allMaxs) : undefined,
    },
    topBoostTips: topBoostTips.slice(0, 5),
    listingInsights,
  };
}
