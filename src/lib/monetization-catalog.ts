import type { B2BBillingPlanId } from "@/lib/b2b-plans";
import {
  applyLaunchPromoPrice,
  isLaunchPromoActive,
  LAUNCH_PROMO_BADGE,
} from "@vauto/shared/launch-promo";

export const VAT_RATE_LT = 0.21;

export type B2CPromoteProductId = "refresh" | "plus" | "top";

export interface B2CPromoteProduct {
  id: B2CPromoteProductId;
  title: string;
  description: string;
  priceEur: number;
  listPriceEur: number;
  visibilityTier: "free" | "plus" | "top" | null;
  bumpOnly: boolean;
  durationDays?: number;
}

const B2C_PROMOTE_CATALOG: Omit<B2CPromoteProduct, "priceEur">[] = [
  {
    id: "refresh",
    title: "Paprastas atnaujinimas",
    description: "Skelbimas pakyla į sąrašo viršų",
    listPriceEur: 1.99,
    visibilityTier: null,
    bumpOnly: true,
  },
  {
    id: "plus",
    title: "PLUS Ženklelis",
    description: "Uždedamas išskirtinis vizualinis rėmelis (7 d.)",
    listPriceEur: 3.99,
    visibilityTier: "plus",
    bumpOnly: false,
    durationDays: 7,
  },
  {
    id: "top",
    title: "TOP Pozicija",
    description: "Skelbimas iškeliamas kategorijos viršuje 14 dienoms",
    listPriceEur: 9.99,
    visibilityTier: "top",
    bumpOnly: false,
    durationDays: 14,
  },
];

function withPromo(product: Omit<B2CPromoteProduct, "priceEur">): B2CPromoteProduct {
  const priceEur = applyLaunchPromoPrice(product.listPriceEur);
  return {
    ...product,
    priceEur,
    description:
      isLaunchPromoActive() && product.listPriceEur > 0
        ? `${LAUNCH_PROMO_BADGE}`
        : product.description,
  };
}

export const B2C_PROMOTE_PRODUCTS: B2CPromoteProduct[] =
  B2C_PROMOTE_CATALOG.map(withPromo);

export type CheckoutProductKind =
  | "b2c_promote"
  | "b2b_subscription"
  | "wardrobe_style_boost"
  | "wardrobe_power_subscription";

export type WardrobeCheckoutProductId = "style_boost" | "power_subscription";

export type CheckoutProductId = B2CPromoteProductId | B2BBillingPlanId | WardrobeCheckoutProductId;

export interface CheckoutSession {
  id: string;
  kind: CheckoutProductKind;
  productId: CheckoutProductId;
  listingId?: string;
  listingTitle?: string;
  lineTitle: string;
  lineDescription: string;
  amountEur: number;
  /** List price before Starto akcijos nuolaidos (UI strikethrough). */
  listAmountEur?: number;
  launchPromo?: boolean;
  vatRate: number;
}

export function getB2CPromoteProduct(id: B2CPromoteProductId): B2CPromoteProduct {
  const product = B2C_PROMOTE_PRODUCTS.find((p) => p.id === id);
  if (!product) throw new Error(`Unknown promote product: ${id}`);
  return product;
}

export function buildB2CPromoteCheckout(
  listingId: string,
  listingTitle: string,
  productId: B2CPromoteProductId
): CheckoutSession {
  const product = getB2CPromoteProduct(productId);
  return {
    id: `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: "b2c_promote",
    productId,
    listingId,
    listingTitle,
    lineTitle: product.title,
    lineDescription: product.description,
    amountEur: product.priceEur,
    vatRate: VAT_RATE_LT,
  };
}

export function calcVatBreakdown(grossEur: number, vatRate: number) {
  const amountNet = Math.round((grossEur / (1 + vatRate)) * 100) / 100;
  const vatAmount = Math.round((grossEur - amountNet) * 100) / 100;
  return { amountNet, vatAmount, amountGross: grossEur };
}
