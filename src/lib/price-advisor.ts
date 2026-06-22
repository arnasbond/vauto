import type { Listing } from "@/lib/types";
import { formatPrice } from "@/data/mockListings";

export type PriceVerdict = "low" | "fair" | "high" | "unknown";

export interface PriceAdvice {
  verdict: PriceVerdict;
  message: string;
  minPrice?: number;
  maxPrice?: number;
  medianPrice?: number;
  sampleSize: number;
}

function normalizeLocation(loc: string): string {
  return loc.toLowerCase().trim().split(/[,\s]/)[0] ?? loc;
}

function comparableListings(
  draft: Pick<Listing, "category" | "location" | "price" | "id">,
  all: Listing[]
): Listing[] {
  const city = normalizeLocation(draft.location);
  return all.filter(
    (l) =>
      l.id !== draft.id &&
      l.category === draft.category &&
      l.status !== "sold" &&
      !l.banned &&
      l.price > 0 &&
      (normalizeLocation(l.location) === city ||
        l.location.toLowerCase().includes(city) ||
        city.includes(normalizeLocation(l.location)))
  );
}

export function getPriceAdvice(
  target: Pick<Listing, "category" | "location" | "price" | "id" | "priceLabel">,
  allListings: Listing[]
): PriceAdvice {
  if (target.priceLabel || target.price <= 0) {
    return {
      verdict: "unknown",
      message: "Paslaugų kainai palyginimas pagal valandą — įveskite kainą rankiniu būdu.",
      sampleSize: 0,
    };
  }

  const peers = comparableListings(target, allListings);
  if (peers.length === 1) {
    return {
      verdict: "fair",
      message: `Panašus skelbimas ${normalizeLocation(target.location)}: ${formatPrice(peers[0].price)}. Tai geras pradinis rinkos orientyras.`,
      minPrice: peers[0].price,
      maxPrice: peers[0].price,
      medianPrice: peers[0].price,
      sampleSize: 1,
    };
  }
  if (peers.length < 2) {
    return {
      verdict: "unknown",
      message: "Dar per mažai panašių skelbimų regione — stebėkite dominančią kainą.",
      sampleSize: peers.length,
    };
  }

  const prices = peers.map((l) => l.price).sort((a, b) => a - b);
  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];
  const medianPrice = prices[Math.floor(prices.length / 2)];
  const ratio = target.price / medianPrice;

  let verdict: PriceVerdict = "fair";
  let message: string;

  if (ratio < 0.75) {
    verdict = "low";
    message = `Kaina žemesnė nei rinkoje (${formatPrice(minPrice)}–${formatPrice(maxPrice)}). Galite parduoti greičiau!`;
  } else if (ratio > 1.25) {
    verdict = "high";
    message = `Kaina aukštesnė nei panašūs skelbimai (${formatPrice(minPrice)}–${formatPrice(maxPrice)}). Sumažinus greičiau sulauksite skambučių.`;
  } else {
    message = `Gera kaina! Panašūs skelbimai ${normalizeLocation(target.location)}: ${formatPrice(minPrice)}–${formatPrice(maxPrice)}.`;
  }

  return {
    verdict,
    message,
    minPrice,
    maxPrice,
    medianPrice,
    sampleSize: peers.length,
  };
}
