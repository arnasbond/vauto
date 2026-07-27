import type { CheckoutSession } from "@/lib/monetization-catalog";
import { VAT_RATE_LT } from "@/lib/monetization-catalog";
import {
  applyLaunchPromoPrice,
  isLaunchPromoActive,
  LAUNCH_PROMO_BADGE,
} from "@vauto/shared/launch-promo";

export type PrePublishVisibilityId = "standard" | "popular" | "maximum";

export interface PrePublishVisibilityOption {
  id: PrePublishVisibilityId;
  label: string;
  description: string;
  priceEur: number;
  /** Catalog list price before launch promo. */
  listPriceEur: number;
  visibilityTier: "free" | "plus" | "top";
  promoted: boolean;
  durationDays?: number;
}

export const PRE_PUBLISH_VISIBILITY_HEADLINE =
  "Prieš publikuojant — padidinkite matomumą";

const PRE_PUBLISH_VISIBILITY_CATALOG: Omit<
  PrePublishVisibilityOption,
  "priceEur"
>[] = [
  {
    id: "standard",
    label: "Standartinis įkėlimas",
    description: "Nemokamai — be papildomo matomumo",
    listPriceEur: 0,
    visibilityTier: "free",
    promoted: false,
  },
  {
    id: "popular",
    label: "TOP pozicija",
    description: "Skelbimas iškeliamas viršuje 14 dienų",
    listPriceEur: 9.99,
    visibilityTier: "top",
    promoted: true,
    durationDays: 14,
  },
  {
    id: "maximum",
    label: "PLUS paryškinimas",
    description: "Paryškintas ženklelis 7 dienas",
    listPriceEur: 3.99,
    visibilityTier: "plus",
    promoted: true,
    durationDays: 7,
  },
];

function withPromoPrice(
  option: Omit<PrePublishVisibilityOption, "priceEur">
): PrePublishVisibilityOption {
  const priceEur = applyLaunchPromoPrice(option.listPriceEur);
  const promo = isLaunchPromoActive() && option.listPriceEur > 0;
  return {
    ...option,
    priceEur,
    description: promo
      ? `${LAUNCH_PROMO_BADGE} · ${option.description}`
      : option.listPriceEur > 0
        ? `+${option.listPriceEur.toFixed(2)} € — ${option.description}`
        : option.description,
  };
}

export const PRE_PUBLISH_VISIBILITY_OPTIONS: PrePublishVisibilityOption[] =
  PRE_PUBLISH_VISIBILITY_CATALOG.map(withPromoPrice);

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
