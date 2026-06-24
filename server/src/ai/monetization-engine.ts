export type MonetizationTier = "free" | "business_pro";

export type MicroPaymentProduct = "smart_boost" | "region_stats" | "generic";

export interface MonetizationState {
  tier: MonetizationTier;
  activeBoost: boolean;
  billingPlan?: string;
  walletBalance?: number;
}

export const SMART_BOOST_PRICE_EUR = 2.99;
export const REGION_STATS_PRICE_EUR = 4.99;
export const VOICE_BOOST_TRIGGER_PHRASE = "Iškelti skelbimą";
export const VOICE_PAY_CONFIRM_PHRASE = "Taip, apmokėti";

const PRICE_ABOVE_MARKET_RATIO = 1.05;

export function resolveMonetizationTier(input: {
  userRole?: string;
  billingPlan?: string;
  role?: string;
}): MonetizationTier {
  if (input.userRole === "business" || input.userRole === "admin") {
    return "business_pro";
  }
  if (input.role === "pro" || input.role === "admin") {
    return "business_pro";
  }
  if (input.billingPlan === "pro" || input.billingPlan === "starter") {
    return "business_pro";
  }
  return "free";
}

export function resolveMonetizationState(input: {
  userRole?: string;
  billingPlan?: string;
  role?: string;
  activeBoost?: boolean;
  walletBalance?: number;
}): MonetizationState {
  return {
    tier: resolveMonetizationTier(input),
    activeBoost: Boolean(input.activeBoost),
    billingPlan: input.billingPlan,
    walletBalance: input.walletBalance,
  };
}

export function inferMicroPaymentProduct(reason: string): MicroPaymentProduct {
  const r = reason.toLowerCase();
  if (r.includes("region") || r.includes("paklausa") || r.includes("statist")) {
    return "region_stats";
  }
  if (r.includes("boost") || r.includes("iškel") || r.includes("matomum")) {
    return "smart_boost";
  }
  return "generic";
}

export function defaultPriceForProduct(product: MicroPaymentProduct): number {
  if (product === "region_stats") return REGION_STATS_PRICE_EUR;
  if (product === "smart_boost") return SMART_BOOST_PRICE_EUR;
  return SMART_BOOST_PRICE_EUR;
}

export function shouldOfferSmartBoost(
  state: MonetizationState,
  draftPrice: number,
  medianPrice: number | null
): boolean {
  if (state.tier !== "free" || state.activeBoost) return false;
  if (!medianPrice || draftPrice <= 0) return false;
  return draftPrice > medianPrice * PRICE_ABOVE_MARKET_RATIO;
}

export function buildSmartBoostProactiveMessage(
  draftPrice: number,
  medianPrice: number,
  itemLabel?: string
): string {
  const label = itemLabel?.trim() || "šio modelio";
  return `Užregistravau juodraštį už ${draftPrice} €. Pastebėjau, kad vidutinė ${label} kaina platformoje yra ${medianPrice} €. Pasakyk „${VOICE_BOOST_TRIGGER_PHRASE}“ balsu, kad suaktyvintum Smart Boost už ${SMART_BOOST_PRICE_EUR.toFixed(2)} €.`;
}

export function buildRegionStatsProactiveMessage(price: number): string {
  return `Gili regiono paklausos statistika prieinama Smart Boost Pro. Pasakyk „${VOICE_PAY_CONFIRM_PHRASE}“ arba patvirtink ekrane — ${price.toFixed(2)} €.`;
}

export function buildMicroPaymentVoiceReply(
  product: MicroPaymentProduct,
  price: number
): string {
  if (product === "region_stats") {
    return `Paruošiau regiono statistikos ataskaitą. Patvirtinkite mokėjimą ekrane arba pasakykite „${VOICE_PAY_CONFIRM_PHRASE}“ — ${price.toFixed(2)} €.`;
  }
  return `Smart Boost paruoštas. Patvirtinkite ekrane arba pasakykite „${VOICE_PAY_CONFIRM_PHRASE}“ — ${price.toFixed(2)} €.`;
}
