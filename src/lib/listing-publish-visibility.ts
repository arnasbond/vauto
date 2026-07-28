import type { CheckoutSession } from "@/lib/monetization-catalog";
import { VAT_RATE_LT } from "@/lib/monetization-catalog";
import { isLaunchPromoActive } from "@vauto/shared/launch-promo";

export type PrePublishVisibilityId = "standard" | "popular" | "maximum";

export interface PrePublishVisibilityOption {
  id: PrePublishVisibilityId;
  label: string;
  description: string;
  priceEur: number;
  /** Catalog list price (Bump / Highlight / VIP are never promo-zeroed). */
  listPriceEur: number;
  visibilityTier: "free" | "plus" | "top";
  promoted: boolean;
  durationDays?: number;
}

export const PRE_PUBLISH_VISIBILITY_HEADLINE =
  "Prieš publikuojant — padidinkite matomumą";

/** Starto akcija: bazinis įkėlimas 0 €; papildomos paslaugos — standartiniai tarifai. */
export const PRE_PUBLISH_PROMO_NOTE =
  "Bazinis skelbimas — 0 €. TOP / PLUS iškėlimai mokami pagal standartinį tarifą.";

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

/**
 * Catalog prices as charged. Launch promo must NOT zero VIP / bump / highlight —
 * only base listing publish is free (listPriceEur === 0).
 */
function withCatalogPrice(
  option: Omit<PrePublishVisibilityOption, "priceEur">
): PrePublishVisibilityOption {
  const priceEur = option.listPriceEur;
  return {
    ...option,
    priceEur,
    description:
      priceEur > 0
        ? `+${priceEur.toFixed(2)} € — ${option.description}`
        : isLaunchPromoActive()
          ? `${option.description} (Starto akcija)`
          : option.description,
  };
}

export const PRE_PUBLISH_VISIBILITY_OPTIONS: PrePublishVisibilityOption[] =
  PRE_PUBLISH_VISIBILITY_CATALOG.map(withCatalogPrice);

export function getPrePublishVisibilityOption(
  id: PrePublishVisibilityId
): PrePublishVisibilityOption {
  return (
    PRE_PUBLISH_VISIBILITY_OPTIONS.find((o) => o.id === id) ??
    PRE_PUBLISH_VISIBILITY_OPTIONS[0]
  );
}

/** Paid extras only — base (0 €) returns null and publishes without checkout. */
export function buildPrePublishVisibilityCheckout(
  listingId: string,
  listingTitle: string,
  option: PrePublishVisibilityOption
): CheckoutSession | null {
  if (option.listPriceEur <= 0 || option.priceEur <= 0) return null;
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
    listAmountEur: option.listPriceEur,
    vatRate: VAT_RATE_LT,
  };
}
