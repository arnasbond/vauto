const { resolveLtCityNominative, normCityForFilter } = require("./lithuanian-location-normalize");

function normCity(loc) {
  return normCityForFilter(loc);
}

function runMarketPriceAnalysis(listings, input) {
  const brand = String(input.make ?? "").toLowerCase();
  const model = String(input.model ?? "").toLowerCase();
  const year = input.year ? String(input.year) : "";
  const category = input.category;
  const city = input.city ? normCity(resolveLtCityNominative(input.city)) : undefined;

  const titleTokens = input.title
    .toLowerCase()
    .split(/[\s,.;:!?()[\]'"-]+/)
    .filter((t) => t.length >= 3);

  let peers = listings.filter((l) => l.price > 0);
  if (category) peers = peers.filter((l) => l.category === category);
  if (city) {
    peers = peers.filter(
      (l) =>
        normCity(l.location) === city ||
        l.location.toLowerCase().includes(city)
    );
  }

  const hay = `${brand} ${model} ${year}`.trim();
  if (hay.replace(/\s/g, "")) {
    peers = peers.filter((l) => {
      const t = `${l.title} ${l.description ?? ""}`.toLowerCase();
      if (brand && !t.includes(brand)) return false;
      if (model && !t.includes(model)) return false;
      if (year && !t.includes(year)) return false;
      return true;
    });
  } else if (titleTokens.length) {
    peers = peers.filter((l) => {
      const t = `${l.title} ${l.description ?? ""}`.toLowerCase();
      const hits = titleTokens.filter((tok) => t.includes(tok)).length;
      return hits >= Math.max(1, Math.ceil(titleTokens.length * 0.34));
    });
  }

  if (peers.length < 1) {
    return {
      sampleSize: 0,
      medianPrice: null,
      minPrice: null,
      maxPrice: null,
      message: "Nepakanka panašių skelbimų rinkos analizei.",
    };
  }

  const prices = peers.map((p) => p.price).sort((a, b) => a - b);
  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];
  const medianPrice = prices[Math.floor(prices.length / 2)];

  return {
    sampleSize: peers.length,
    minPrice,
    maxPrice,
    medianPrice,
    message: `Rinkoje rasta ${peers.length} panašių skelbimų: ${minPrice}–${maxPrice} €, vidurkis ~${medianPrice} €.`,
  };
}

module.exports = { runMarketPriceAnalysis };
