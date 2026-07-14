import type { CheckoutSession } from "@/lib/monetization-catalog";
import { VAT_RATE_LT } from "@/lib/monetization-catalog";

export type PrePublishVisibilityId = "standard" | "popular" | "maximum";

export interface PrePublishVisibilityOption {
  id: PrePublishVisibilityId;
  label: string;
  description: string;
  priceEur: number;
  visibilityTier: "free" | "plus" | "top";
  promoted: boolean;
  durationDays?: number;
}

export const PRE_PUBLISH_VISIBILITY_HEADLINE = "🚀 Gaukite iki 5x daugiau peržiūrų!";

export const PRE_PUBLISH_VISIBILITY_OPTIONS: PrePublishVisibilityOption[] = [
  {
    id: "standard",
    label: "Standartinis įkėlimas",
    description: "Nemokamai",
    priceEur: 0,
    visibilityTier: "free",
    promoted: false,
  },
  {
    id: "popular",
    label: "Populiarus skelbimas",
    description: "+2.99€ — skelbimas bus viršuje 7 dienas",
    priceEur: 2.99,
    visibilityTier: "top",
    promoted: true,
    durationDays: 7,
  },
  {
    id: "maximum",
    label: "Maksimalus matomumas",
    description: "+4.99€ — viršuje, paryškintas spalva + VIP juosta",
    priceEur: 4.99,
    visibilityTier: "plus",
    promoted: true,
    durationDays: 30,
  },
];

export function getPrePublishVisibilityOption(
  id: PrePublishVisibilityId
): PrePublishVisibilityOption {
  return (
    PRE_PUBLISH_VISIBILITY_OPTIONS.find((o) => o.id === id) ??
    PRE_PUBLISH_VISIBILITY_OPTIONS[0]
  );
}

export function buildPrePublishVisibilityCheckout(
  listingId: string,
  listingTitle: string,
  option: PrePublishVisibilityOption
): CheckoutSession | null {
  if (option.priceEur <= 0) return null;
  const productId = option.id === "popular" ? "top" : "plus";
  return {
    id: `prepub-vis-${listingId}-${option.id}`,
    kind: "b2c_promote",
    productId,
    listingId,
    listingTitle,
    lineTitle: option.label,
    lineDescription: option.description,
    amountEur: option.priceEur,
    vatRate: VAT_RATE_LT,
  };
}
