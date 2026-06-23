import type { Listing } from "@/lib/types";
import { getPromoteLabelsForCategory } from "@/lib/chameleon-themes";
import { getMarketInsights, type MarketInsights } from "@/lib/market-insights";
import type { PriceVerdict } from "@/lib/price-advisor";
import {
  getRecommendedVisibilityTier,
  getVisibilityPlans,
  type VisibilityPlan,
  type VisibilityTierId,
} from "@/lib/visibility-plans";
import type { UserProfile } from "@/lib/types";

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
  /** Fiksuotų matomumo pakopų sąrašas */
  plans: VisibilityPlan[];
  recommendedTierId: VisibilityTierId;
  selectedTierId?: VisibilityTierId;
}

interface PromoteOptions {
  allListings?: Listing[];
  buyerIntentCount?: number;
  user?: Pick<UserProfile, "billingPlan" | "walletBalance">;
}

export function getPromoteSuggestion(
  listing: Listing,
  options?: PromoteOptions
): PromoteSuggestion {
  const region = listing.location.split(",")[0]?.trim() || "jūsų regione";
  const labels = getPromoteLabelsForCategory(listing.category);

  const allListings = options?.allListings ?? [];
  const insights =
    allListings.length > 0
      ? getMarketInsights(listing, allListings, {
          buyerIntentCount: options?.buyerIntentCount,
        })
      : undefined;

  const plans = getVisibilityPlans(listing, allListings, options?.user);
  const recommendedTierId = insights
    ? getRecommendedVisibilityTier(insights.competitorCount, insights)
    : 2;

  const recommendedPlan =
    plans.find((p) => p.id === recommendedTierId && p.available) ??
    plans.find((p) => p.available) ??
    plans[0];

  const competitorCount = insights?.competitorCount ?? 0;
  const priceVerdict = insights?.priceAdvice.verdict;
  const promoteTip = insights?.boostTips.find((t) => t.action === "promote");

  let urgency: PromoteSuggestion["urgency"] = "low";
  let reason = `Pasirinkite matomumo planą — ${region}`;
  let message =
    "Fiksuotos kainos be kainų lenktynių. Brangesnės pakopos turi ribotą vietų skaičių.";

  if (promoteTip) {
    reason = promoteTip.title;
    message = promoteTip.detail;
    urgency = promoteTip.urgency;
  } else if (competitorCount >= 4) {
    urgency = "high";
    reason = "Daug konkurentų — reikia matomumo";
    message = `${competitorCount} panašūs skelbimai. Rekomenduojame „${recommendedPlan.label}“ — ${recommendedPlan.feedPosition.toLowerCase()}.`;
  } else if ((options?.buyerIntentCount ?? 0) > 0) {
    urgency = "high";
    reason = "Aktyvi paklausa";
    message = `Pirkėjai ieško panašių prekių — planas „${recommendedPlan.label}“ padės būti aukščiau reitinge.`;
  } else if (priceVerdict === "low" && competitorCount >= 2) {
    urgency = "medium";
    reason = "Gera kaina — reikia matomumo";
    message = `Kaina konkurencinga, bet ${competitorCount} konkurentai matomesni. Pradėkite nuo „${recommendedPlan.label}“.`;
  } else {
    urgency = competitorCount >= 2 ? "medium" : "low";
    reason = labels.cardCta;
    message = `Pasirinkite vieną iš ${plans.filter((p) => p.available).length} galimų planų — kuo aukštesnė pakopa, tuo aukščiau pozicija (iki 3–5 pasiūlymų zonoje).`;
  }

  return {
    message,
    cost: recommendedPlan.price,
    durationDays: recommendedPlan.durationDays,
    region,
    labels,
    reason,
    urgency,
    expectedLift: recommendedPlan.expectedLift,
    competitorCount,
    priceVerdict,
    insights,
    plans,
    recommendedTierId,
    selectedTierId: recommendedPlan.id,
  };
}

export function resolveSelectedPlan(suggestion: PromoteSuggestion): VisibilityPlan {
  const selected =
    suggestion.plans.find((p) => p.id === suggestion.selectedTierId) ??
    suggestion.plans.find((p) => p.recommended) ??
    suggestion.plans.find((p) => p.available) ??
    suggestion.plans[0];
  return selected;
}
