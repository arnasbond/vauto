const SMART_BOOST_C2C = 2.99;
const SMART_BOOST_B2B = 29.99;
const BUSINESS_MONTHLY_PRO = 199.0;
const B2B_LEAD_PRICE = 14.99;
const SMART_BOOST_PRICE_EUR = SMART_BOOST_C2C;
const VOICE_BOOST_TRIGGER_PHRASE = "Iškelti skelbimą";
const VOICE_PAY_CONFIRM_PHRASE = "Taip, apmokėti";
const PRICE_ABOVE_MARKET_RATIO = 1.05;

function resolveMonetizationAudience(input) {
  if (input.userRole === "business" || input.userRole === "admin") {
    return "b2b";
  }
  return "c2c";
}

function resolveMonetizationTier(input) {
  if (input.userRole === "admin") return "business_pro";
  if (input.role === "admin") return "business_pro";
  if (input.billingPlan === "pro") return "business_pro";
  return "free";
}

function resolveMonetizationState(input) {
  return {
    tier: resolveMonetizationTier(input),
    audience: resolveMonetizationAudience(input),
    activeBoost: Boolean(input.activeBoost),
    billingPlan: input.billingPlan,
    walletBalance: input.walletBalance,
  };
}

function resolveSmartBoostPrice(state) {
  return state.audience === "b2b" ? SMART_BOOST_B2B : SMART_BOOST_C2C;
}

function inferMicroPaymentProduct(reason) {
  const r = reason.toLowerCase();
  if (
    r.includes("lead") ||
    r.includes("kontakt") ||
    r.includes("tikslin") ||
    r.includes("klient")
  ) {
    return "b2b_lead";
  }
  if (r.includes("region") || r.includes("paklausa") || r.includes("statist")) {
    return "region_stats";
  }
  if (r.includes("boost") || r.includes("iškel") || r.includes("matomum")) {
    return "smart_boost";
  }
  return "generic";
}

function defaultPriceForProduct(product, state) {
  if (product === "smart_boost") return resolveSmartBoostPrice(state);
  if (product === "b2b_lead") return B2B_LEAD_PRICE;
  if (product === "region_stats") return BUSINESS_MONTHLY_PRO;
  return resolveSmartBoostPrice(state);
}

function shouldOfferSmartBoost(state, draftPrice, medianPrice) {
  if (state.tier === "business_pro" || state.activeBoost) return false;
  if (!medianPrice || draftPrice <= 0) return false;
  return draftPrice > medianPrice * PRICE_ABOVE_MARKET_RATIO;
}

function buildSmartBoostProactiveMessage(draftPrice, medianPrice, state, itemLabel) {
  const label = itemLabel?.trim() || "šio modelio";
  const boostPrice = resolveSmartBoostPrice(state);
  const priceHint =
    state.audience === "b2b"
      ? ` Smart Boost verslui kainuoja ${boostPrice.toFixed(2)} € — aukštesnė kaina skatina apgalvotą matomumą ir saugo rinką nuo dirbtinės konkurencijos.`
      : ` Smart Boost kainuoja ${boostPrice.toFixed(2)} €.`;
  return `Užregistravau juodraštį už ${draftPrice} €. Pastebėjau, kad vidutinė ${label} kaina platformoje yra ${medianPrice} €.${priceHint} Pasakyk „${VOICE_BOOST_TRIGGER_PHRASE}“ balsu, kad suaktyvintum Smart Boost.`;
}

function buildBusinessProUpsellMessage() {
  return `Gili regiono paklausos statistika ir AI rekomendacijos prieinamos tik Business Pro plane — ${BUSINESS_MONTHLY_PRO.toFixed(2)} € per mėnesį. Atidaryk verslo skydelį arba pasakyk „Verslo planas“, kad peržiūrėtumėte prenumeratą.`;
}

function buildMicroPaymentVoiceReply(product, price, state) {
  if (product === "region_stats") {
    return `Paruošiau regiono statistikos ataskaitą Business Pro prenumeratoriams. Patvirtinkite ekrane arba pasakykite „${VOICE_PAY_CONFIRM_PHRASE}“.`;
  }
  if (product === "b2b_lead") {
    return `Tikslinio kliento kontaktas paruoštas. Patvirtinkite Lead Gen mokėjimą ekrane arba pasakykite „${VOICE_PAY_CONFIRM_PHRASE}“ — ${price.toFixed(2)} €.`;
  }
  if (state.audience === "b2b") {
    return `Smart Boost verslui paruoštas už ${price.toFixed(2)} €. AI rekomenduoja šį iškėlimą tik tiems skelbimams, kurie tikrai verti matomumo — aukštesnė kaina apsaugo rinką nuo dirbtinės konkurencijos. Patvirtinkite ekrane arba pasakykite „${VOICE_PAY_CONFIRM_PHRASE}“.`;
  }
  return `Smart Boost paruoštas už ${price.toFixed(2)} €. Patvirtinkite ekrane arba pasakykite „${VOICE_PAY_CONFIRM_PHRASE}“.`;
}

function requiresBusinessProForRegionStats(state) {
  return state.audience === "b2b" && state.tier !== "business_pro";
}

module.exports = {
  SMART_BOOST_C2C,
  SMART_BOOST_B2B,
  BUSINESS_MONTHLY_PRO,
  B2B_LEAD_PRICE,
  SMART_BOOST_PRICE_EUR,
  resolveMonetizationState,
  resolveSmartBoostPrice,
  inferMicroPaymentProduct,
  defaultPriceForProduct,
  shouldOfferSmartBoost,
  buildSmartBoostProactiveMessage,
  buildBusinessProUpsellMessage,
  buildMicroPaymentVoiceReply,
  requiresBusinessProForRegionStats,
};
