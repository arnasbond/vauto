import type { AgentListingSummary } from "./agent-tools.js";
import { normCityForFilter, resolveLtCityNominative } from "./lithuanian-location-normalize.js";

export interface MarketPriceAnalysisInput {
  title: string;
  category?: string;
  city?: string;
  make?: string;
  model?: string;
  year?: string;
}

export interface MarketPriceAnalysisResult {
  sampleSize: number;
  medianPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  message: string;
}

function normCity(loc: string): string {
  return normCityForFilter(loc);
}

export function runMarketPriceAnalysis(
  listings: AgentListingSummary[],
  input: MarketPriceAnalysisInput
): MarketPriceAnalysisResult {
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
  const minPrice = prices[0]!;
  const maxPrice = prices[prices.length - 1]!;
  const medianPrice = prices[Math.floor(prices.length / 2)]!;

  return {
    sampleSize: peers.length,
    minPrice,
    maxPrice,
    medianPrice,
    message: city
      ? `Rinkoje rasta ${peers.length} panašių skelbimų: ${minPrice}–${maxPrice} €, vidurkis ~${medianPrice} €.`
      : `Rinkoje (visa Lietuva) rasta ${peers.length} panašių skelbimų: ${minPrice}–${maxPrice} €, vidurkis ~${medianPrice} €.`,
  };
}
