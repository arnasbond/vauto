import type { DynamicFilter, Listing, ScoredListing } from "@/lib/types";
import { isListingActive } from "@/lib/listing-expiry";

export { isListingActive } from "@/lib/listing-expiry";

export function computeSemanticRelevance(
  query: string,
  listing: Listing
): number {
  if (!query.trim()) return 0.5;

  const tokens = query
    .toLowerCase()
    .split(/[\s,.!?]+/)
    .filter((t) => t.length > 2);

  const haystack = [
    listing.title,
    listing.location,
    listing.category,
    ...listing.tags,
  ]
    .join(" ")
    .toLowerCase();

  if (tokens.length === 0) return 0.5;

  const matches = tokens.filter((t) => haystack.includes(t)).length;
  let score = matches / tokens.length;

  if (/telefon|phone|mobil/i.test(query) && listing.category === "electronics")
    score = Math.min(1, score + 0.3);
  if (/žol|pjov|sod/i.test(query) && listing.category === "services")
    score = Math.min(1, score + 0.4);
  if (/auto|mašin|golf|opel/i.test(query) && listing.category === "vehicles")
    score = Math.min(1, score + 0.35);
  if (/pig|nebrang|budget|cheap/i.test(query) && listing.price < 500)
    score = Math.min(1, score + 0.2);
  if (/meistr|elektr|remont/i.test(query) && listing.category === "services")
    score = Math.min(1, score + 0.35);
  if (
    /darbas|darbu|atlygin|alg|ieškau darbo|siūlau darbą/i.test(query) &&
    listing.category === "jobs"
  )
    score = Math.min(1, score + 0.4);

  return Math.min(1, Math.max(0, score));
}

export function computeProximityScore(distanceKm: number): number {
  return 1 / (1 + distanceKm / 10);
}

export function computePriceAttractiveness(
  listing: Listing,
  query: string
): number {
  const caps: Record<string, number> = {
    electronics: 800,
    vehicles: 15000,
    services: 100,
    home: 500,
    other: 1000,
  };
  const cap = caps[listing.category] ?? 1000;
  let score = 1 - Math.min(listing.price / cap, 1);

  if (/pig|nebrang/i.test(query)) {
    score = 1 - Math.min(listing.price / (cap * 0.5), 1);
  }

  return score;
}

/** 4th pillar — newer listings rank higher */
export function computeRecencyScore(createdAt: string): number {
  const days =
    (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return Math.max(0, 1 - days / 30);
}

/** Adaptive weights: services → proximity; shippable goods → price */
function getScoringWeights(query: string): {
  semantic: number;
  proximity: number;
  price: number;
  recency: number;
} {
  const q = query.toLowerCase();
  const isService = /žol|meistr|paslaug|remont|montuoj|elektr|kirp|maniki/i.test(q);
  const isShippable = /telefon|iphone|siunt|pašt|dvirat|kompiuter/i.test(q);

  if (isService) {
    return { semantic: 0.4, proximity: 0.4, price: 0.1, recency: 0.1 };
  }
  if (isShippable) {
    return { semantic: 0.4, proximity: 0.15, price: 0.35, recency: 0.1 };
  }
  return { semantic: 0.45, proximity: 0.25, price: 0.2, recency: 0.1 };
}

export function rankListings(
  listings: Listing[],
  query: string,
  sortMode?: "default" | "newest" | "cheapest" | "closest"
): ScoredListing[] {
  const active = listings.filter(isListingActive);
  const w = getScoringWeights(query);

  let results = active
    .map((listing) => {
      const semanticRelevance = computeSemanticRelevance(query, listing);
      const proximityScore = computeProximityScore(listing.distanceKm);
      const priceAttractiveness = computePriceAttractiveness(listing, query);
      const recencyScore = computeRecencyScore(listing.createdAt);

      const score =
        semanticRelevance * w.semantic +
        proximityScore * w.proximity +
        priceAttractiveness * w.price +
        recencyScore * w.recency;

      return {
        ...listing,
        score,
        semanticRelevance,
        proximityScore,
        priceAttractiveness,
        recencyScore,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (sortMode === "newest") {
    results = [...results].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } else if (sortMode === "cheapest") {
    results = [...results].sort((a, b) => a.price - b.price);
  } else if (sortMode === "closest") {
    results = [...results].sort((a, b) => a.distanceKm - b.distanceKm);
  }

  return results;
}

export function generateDynamicFilters(query: string): DynamicFilter[] {
  const q = query.toLowerCase();
  const filters: DynamicFilter[] = [];

  if (/auto|mašin|golf|opel|vw/i.test(q)) {
    filters.push(
      {
        id: "under-5k",
        label: "Iki 5000€",
        apply: (l) => l.category === "vehicles" && l.price <= 5000,
      },
      {
        id: "automatic",
        label: "Automatinė",
        apply: (l) =>
          l.category === "vehicles" &&
          /automatin/i.test(l.title + l.tags.join(" ")),
      },
      {
        id: "closest",
        label: "Arčiausiai manęs",
        apply: (l) => l.distanceKm <= 10,
      }
    );
  }

  if (/telefon|phone|iphone|samsung/i.test(q)) {
    filters.push(
      {
        id: "under-300",
        label: "Iki 300€",
        apply: (l) => l.category === "electronics" && l.price <= 300,
      },
      {
        id: "teen",
        label: "Paaugliui",
        apply: (l) =>
          l.category === "electronics" &&
          (l.tags.includes("paaugliui") || l.price < 250),
      }
    );
  }

  if (/žol|pjov|sod|meistr/i.test(q)) {
    filters.push(
      {
        id: "nearby",
        label: "Arčiausiai manęs",
        apply: (l) => l.distanceKm <= 15,
      },
      {
        id: "cheap-service",
        label: "Pigiausi",
        apply: (l) => l.category === "services" && l.price <= 40,
      }
    );
  }

  if (/darbas|darbu|atlygin|alg|ieškau|siūlau darbą/i.test(q)) {
    filters.push(
      {
        id: "job-offers",
        label: "Siūlomi darbai",
        apply: (l) =>
          l.category === "jobs" &&
          l.attributes?.jobType === "Siūlau darbą",
      },
      {
        id: "job-seekers",
        label: "Ieškantys darbo",
        apply: (l) =>
          l.category === "jobs" &&
          l.attributes?.jobType === "Ieškau darbo",
      },
      {
        id: "remote-job",
        label: "Nuotolinis",
        apply: (l) =>
          l.category === "jobs" &&
          l.attributes?.employmentType === "Nuotolinis",
      }
    );
  }

  if (/pig|nebrang/i.test(q)) {
    filters.push({
      id: "budget",
      label: "Biudžetiniai",
      apply: (l) => l.price <= 200,
    });
  }

  if (filters.length === 0) {
    filters.push(
      { id: "nearby", label: "Šalia manęs", apply: (l) => l.distanceKm <= 5 },
      { id: "cheapest", label: "Pigiausi", apply: () => true },
      { id: "newest", label: "Naujausi", apply: () => true },
      { id: "with-video", label: "Su video", apply: (l) => !!l.hasVideo }
    );
  } else {
    filters.push(
      { id: "newest", label: "Naujausi", apply: () => true },
      { id: "with-video", label: "Su video", apply: (l) => !!l.hasVideo }
    );
  }

  return filters;
}

export function detectPurchaseIntent(text: string): boolean {
  const keywords = [
    "perku",
    "pirkčiau",
    "tinka",
    "paimsiu",
    "sutinku",
    "deal",
    "mokėsiu",
    "užsakau",
  ];
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function resolveSortMode(
  activeFilterIds: Set<string>
): "default" | "newest" | "cheapest" | "closest" {
  if (activeFilterIds.has("newest")) return "newest";
  if (activeFilterIds.has("cheapest") || activeFilterIds.has("budget") || activeFilterIds.has("cheap-service"))
    return "cheapest";
  if (activeFilterIds.has("closest") || activeFilterIds.has("nearby"))
    return "closest";
  return "default";
}
