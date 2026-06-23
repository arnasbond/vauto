import type { Listing } from "@/lib/types";
import { getPromoteLabelsForCategory } from "@/lib/chameleon-themes";
import { getMarketInsights, type MarketInsights } from "@/lib/market-insights";
import type { PriceVerdict } from "@/lib/price-advisor";

export interface PromoteSuggestion {
  message: string;
  cost: number;
  durationDays: number;
  region: string;
  labels: ReturnType<typeof getPromoteLabelsForCategory>;
  reason: string;
  urgency: "low" | "medium" | "high";
  expectedLift: string;
  competitorCount: number;
  priceVerdict?: PriceVerdict;
  insights?: MarketInsights;
}

interface PromoteOptions {
  allListings?: Listing[];
  buyerIntentCount?: number;
}

export function getPromoteSuggestion(
  listing: Listing,
  options?: PromoteOptions
): PromoteSuggestion {
  const region = listing.location.split(",")[0]?.trim() || "jūsų regione";
  const labels = getPromoteLabelsForCategory(listing.category);
  const base = listing.category === "vehicles" ? 4.99 : 2.99;
  const cost =
    listing.category === "real_estate"
      ? 9.99
      : listing.category === "services"
        ? 3.49
        : base;

  const allListings = options?.allListings ?? [];
  const insights =
    allListings.length > 0
      ? getMarketInsights(listing, allListings, {
          buyerIntentCount: options?.buyerIntentCount,
        })
      : undefined;

  const competitorCount = insights?.competitorCount ?? 0;
  const priceVerdict = insights?.priceAdvice.verdict;
  const promoteTip = insights?.boostTips.find((t) => t.action === "promote");

  let urgency: PromoteSuggestion["urgency"] = "low";
  let reason = `${labels.cardCta} — padidinkite matomumą ${region}`;
  let message = `${labels.cardCta} — padidinkite matomumą ${region} už ${cost.toFixed(2)}€`;
  const expectedLift = insights?.predictedVisibilityLift ?? "Iki +120% matomumo";

  if (promoteTip) {
    reason = promoteTip.title;
    message = promoteTip.detail;
    urgency = promoteTip.urgency;
  } else if (competitorCount >= 4) {
    urgency = "high";
    reason = "Daug konkurentų — reikia iškėlimo";
    message = `${competitorCount} panašūs skelbimai ${region}. ${labels.cardCta} — būkite matomi pirmiausia.`;
  } else if ((options?.buyerIntentCount ?? 0) > 0) {
    urgency = "high";
    reason = "Aktyvi paklausa";
    message = `Pirkėjai ieško panašių prekių — ${labels.bumpLabel} padės būti aukščiau reitinge.`;
  } else if (priceVerdict === "low" && competitorCount >= 2) {
    urgency = "medium";
    reason = "Gera kaina — reikia matomumo";
    message = `Kaina konkurencinga, bet ${competitorCount} konkurentai matomesni. ${labels.cardCta}.`;
  } else {
    const categoryMessages: Record<string, string> = {
      vehicles: `${labels.cardCta} — daugiau peržiūrų ${region} automobilių pirkėjams`,
      clothing: `${labels.bumpLabel} — matomumas mados entuziastams ${region}`,
      services: `${labels.cardCta} — daugiau užklausų ${region}`,
      real_estate: `${labels.cardCta} — ${labels.bumpLabel} didesniam matomumui ${region}`,
    };
    message = categoryMessages[listing.category] ?? message;
    reason = labels.cardCta;
    urgency = competitorCount >= 2 ? "medium" : "low";
  }

  return {
    message,
    cost,
    durationDays: 7,
    region,
    labels,
    reason,
    urgency,
    expectedLift,
    competitorCount,
    priceVerdict,
    insights,
  };
}
