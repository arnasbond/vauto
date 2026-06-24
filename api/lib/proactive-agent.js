const PRICE_ABOVE_MARKET_RATIO = 1.05;

function buildProactivePricingMessage(draftPrice, analysis, itemLabel) {
  const median = analysis.medianPrice;
  if (!median || draftPrice <= 0) return null;
  if (draftPrice <= median * PRICE_ABOVE_MARKET_RATIO) return null;

  const label = itemLabel?.trim() || "šio modelio";
  return `Užregistravau juodraštį už ${draftPrice} €. Pastebėjau, kad vidutinė ${label} kaina platformoje yra ${median} €. Ar norėtumėte pakoreguoti kainą, kad skelbimas sulauktų daugiau dėmesio?`;
}

function buildProactiveSearchResetMessage(searchSummary, searchQuery) {
  let tail = searchSummary?.trim();
  if (!tail && searchQuery?.trim()) {
    tail = `Štai ${searchQuery.trim()}.`;
  }
  if (!tail) tail = "Štai atnaujinti rezultatai.";
  return `Senus paieškos kriterijus išvaliau. ${tail}`;
}

module.exports = {
  buildProactivePricingMessage,
  buildProactiveSearchResetMessage,
};
