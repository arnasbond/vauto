const SMART_BOOST_PRICE_EUR = 2.99;
const REGION_STATS_PRICE_EUR = 4.99;
const VOICE_BOOST_TRIGGER_PHRASE = "Iškelti skelbimą";
const VOICE_PAY_CONFIRM_PHRASE = "Taip, apmokėti";
const PRICE_ABOVE_MARKET_RATIO = 1.05;

function resolveMonetizationTier(input) {
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

function resolveMonetizationState(input) {
  return {
    tier: resolveMonetizationTier(input),
    activeBoost: Boolean(input.activeBoost),
    billingPlan: input.billingPlan,
    walletBalance: input.walletBalance,
  };
}

function inferMicroPaymentProduct(reason) {
  const r = reason.toLowerCase();
  if (r.includes("region") || r.includes("paklausa") || r.includes("statist")) {
    return "region_stats";
  }
  if (r.includes("boost") || r.includes("iškel") || r.includes("matomum")) {
    return "smart_boost";
  }
  return "generic";
}

function defaultPriceForProduct(product) {
  if (product === "region_stats") return REGION_STATS_PRICE_EUR;
  if (product === "smart_boost") return SMART_BOOST_PRICE_EUR;
  return SMART_BOOST_PRICE_EUR;
}

function shouldOfferSmartBoost(state, draftPrice, medianPrice) {
  if (state.tier !== "free" || state.activeBoost) return false;
  if (!medianPrice || draftPrice <= 0) return false;
  return draftPrice > medianPrice * PRICE_ABOVE_MARKET_RATIO;
}

function buildSmartBoostProactiveMessage(draftPrice, medianPrice, itemLabel) {
  const label = itemLabel?.trim() || "šio modelio";
  return `Užregistravau juodraštį už ${draftPrice} €. Pastebėjau, kad vidutinė ${label} kaina platformoje yra ${medianPrice} €. Pasakyk „${VOICE_BOOST_TRIGGER_PHRASE}“ balsu, kad suaktyvintum Smart Boost už ${SMART_BOOST_PRICE_EUR.toFixed(2)} €.`;
}

function buildMicroPaymentVoiceReply(product, price) {
  if (product === "region_stats") {
    return `Paruošiau regiono statistikos ataskaitą. Patvirtinkite mokėjimą ekrane arba pasakykite „${VOICE_PAY_CONFIRM_PHRASE}“ — ${price.toFixed(2)} €.`;
  }
  return `Smart Boost paruoštas. Patvirtinkite ekrane arba pasakykite „${VOICE_PAY_CONFIRM_PHRASE}“ — ${price.toFixed(2)} €.`;
}

module.exports = {
  SMART_BOOST_PRICE_EUR,
  REGION_STATS_PRICE_EUR,
  resolveMonetizationState,
  inferMicroPaymentProduct,
  defaultPriceForProduct,
  shouldOfferSmartBoost,
  buildSmartBoostProactiveMessage,
  buildMicroPaymentVoiceReply,
};
