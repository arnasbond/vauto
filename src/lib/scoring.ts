import type { DynamicFilter, Listing, ScoredListing } from "@/lib/types";
import { isListingActive } from "@/lib/listing-expiry";
import { visibilityBoostScore } from "@/lib/visibility-plans";
import {
  extractPlateFromQuery,
  extractVinFromQuery,
  isVehicleQuery,
  VEHICLE_BRAND_PATTERN,
} from "@/lib/vehicle-keywords";
import {
  computeVisualRelevance,
  type VisualSearchProfile,
} from "@/lib/visual-search";

export { isListingActive } from "@/lib/listing-expiry";

const MIN_QUERY_RELEVANCE = 0.18;

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,.!?]+/)
    .filter((t) => t.length >= 2);
}

function clothingSubtypeSignals(query: string): {
  wantsShoes: boolean;
  wantsCoat: boolean;
  wantsDress: boolean;
} {
  const q = query.toLowerCase();
  return {
    wantsShoes: /bat|keden|aulis|sportin.*bat|nike|adidas|dydis/i.test(q),
    wantsCoat: /palt|striuk|vilnon/i.test(q),
    wantsDress: /suknel/i.test(q),
  };
}

export function computeSemanticRelevance(
  query: string,
  listing: Listing
): number {
  if (!query.trim()) return 0.5;

  const tokens = tokenizeQuery(query);

  const haystack = [
    listing.title,
    listing.location,
    listing.category,
    listing.description ?? "",
    ...listing.tags,
    ...Object.entries(listing.attributes ?? {}).flatMap(([key, value]) => [
      key,
      ...(Array.isArray(value) ? value : value ? [value] : []),
    ]),
    String(listing.attributes?.skelbiuCategory ?? ""),
    String(listing.attributes?.listingAction ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  if (tokens.length === 0) return 0.5;

  const matches = tokens.filter((t) => haystack.includes(t)).length;
  let score = tokens.length > 0 ? matches / tokens.length : 0.5;

  const sizeMatch = query.match(/\b(\d{2})\b/);
  const listingSize = String(
    listing.attributes?.size ?? listing.attributes?.dydis ?? ""
  );
  if (sizeMatch && listingSize.includes(sizeMatch[1])) {
    score = Math.min(1, score + 0.35);
  }

  if (listing.category === "clothing") {
    const subtype = clothingSubtypeSignals(query);
    const isShoe = /bat|keden|aulis|nike|air force/i.test(haystack);
    const isCoat = /palt|striuk|vilnon/i.test(haystack);
    const isDress = /suknel/i.test(haystack);

    if (subtype.wantsShoes) {
      if (isShoe) score = Math.min(1, score + 0.45);
      if (isCoat || isDress) score = Math.max(0, score - 0.55);
    }
    if (subtype.wantsCoat && isCoat) score = Math.min(1, score + 0.4);
    if (subtype.wantsDress && isDress) score = Math.min(1, score + 0.4);
    if (/bat/i.test(query) && listing.category === "clothing" && isShoe) {
      score = Math.min(1, score + 0.25);
    }
  }

  const plate = extractPlateFromQuery(query);
  const vin = extractVinFromQuery(query);
  const attrs = listing.attributes ?? {};
  const listingPlate = String(attrs.plateNumber ?? attrs.plate ?? "").toUpperCase();
  const listingVin = String(attrs.vin ?? "").toUpperCase();

  if (plate && listingPlate.replace(/\s+/g, "") === plate.replace(/\s+/g, "")) {
    score = 1;
  }
  if (vin && listingVin === vin) {
    score = 1;
  }
  if (vin && listingVin.includes(vin)) {
    score = Math.max(score, 0.95);
  }

  if (/telefon|phone|mobil/i.test(query) && listing.category === "electronics")
    score = Math.min(1, score + 0.3);
  if (/žol|pjov|sod/i.test(query) && listing.category === "services")
    score = Math.min(1, score + 0.4);
  if (
    (isVehicleQuery(query) || VEHICLE_BRAND_PATTERN.test(query)) &&
    listing.category === "vehicles"
  )
    score = Math.min(1, score + 0.35);
  if (/auto|mašin|golf|opel|citroen|peugeot|bmw|audi|vw/i.test(query) && listing.category === "vehicles")
    score = Math.min(1, score + 0.35);
  if (/ratlank|padang|r16|r17|felg|disk/i.test(query) && listing.category === "vehicles")
    score = Math.min(1, score + 0.45);
  if (/pig|nebrang|budget|cheap/i.test(query) && listing.price < 500)
    score = Math.min(1, score + 0.2);
  if (/meistr|elektr|remont/i.test(query) && listing.category === "services")
    score = Math.min(1, score + 0.35);
  if (
    /darbas|darbu|atlygin|alg|ieškau darbo|siūlau darbą/i.test(query) &&
    listing.category === "jobs"
  )
    score = Math.min(1, score + 0.4);

  if (listing.category === "jobs") {
    const expArea = String(attrs.experienceArea ?? "").toLowerCase();
    const employer = String(attrs.employerName ?? "").toLowerCase();
    const jobGroup = String(attrs.jobGroup ?? "").toLowerCase();
    const qLower = query.toLowerCase();

    if (expArea && tokens.some((t) => expArea.includes(t))) {
      score = Math.min(1, score + 0.25);
    }
    if (employer && tokens.some((t) => employer.includes(t))) {
      score = Math.min(1, score + 0.3);
    }
    if (jobGroup && qLower.includes(jobGroup)) {
      score = Math.min(1, score + 0.15);
    }
    const listingCity = listing.location.toLowerCase();
    if (tokens.some((t) => t.length > 3 && listingCity.includes(t))) {
      score = Math.min(1, score + 0.2);
    }
    if (/vairuotoj|kurjer|sand[eė]l|program|buhalter|barista/i.test(query)) {
      if (haystack.match(/vairuotoj|kurjer|sand[eė]l|program|buhalter|barista/i)) {
        score = Math.min(1, score + 0.28);
      }
    }
    if (attrs.locationType === "Darbas namuose" && /nuotolin|namuose|remote/i.test(query)) {
      score = Math.min(1, score + 0.25);
    }
  }

  const skCat = String(attrs.skelbiuCategory ?? "").toLowerCase();
  const isGeneral =
    listing.category === "other" ||
    listing.category === "electronics" ||
    listing.category === "home";
  if (isGeneral && skCat) {
    const catHits = tokens.filter((t) => skCat.includes(t)).length;
    if (catHits > 0) score = Math.min(1, score + 0.2 + catHits * 0.08);
  }
  if (isGeneral && /kamado|kepsnin|grill/i.test(query) && /kepsnin|kamado|grill/i.test(skCat)) {
    score = Math.min(1, score + 0.35);
  }
  if (/parduod|siūl|pardav/i.test(query) && attrs.listingAction === "Siūlau") {
    score = Math.min(1, score + 0.12);
  }
  if (/ieškau|perku|reikia/i.test(query) && attrs.listingAction === "Ieškau") {
    score = Math.min(1, score + 0.12);
  }
  if (/telefon|iphone|samsung/i.test(query) && listing.category === "electronics") {
    score = Math.min(1, score + 0.3);
  }
  if (/bald|sofa|komod/i.test(query) && listing.category === "home") {
    score = Math.min(1, score + 0.3);
  }
  if (/bat|batai|drabu|striuk|suknel|palt/i.test(query) && listing.category === "clothing") {
    score = Math.min(1, score + 0.3);
  }
  if (/laikrod|rolex|casio/i.test(query) && listing.category !== "clothing") {
    score = Math.min(1, score + 0.25);
  }
  if (/laikrod|rolex|casio/i.test(query) && listing.category === "clothing") {
    score = Math.max(0, score - 0.4);
  }

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
  const isShippable = /telefon|iphone|siunt|pašt|dvirat|kompiuter|ratlank|padang/i.test(q);

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
  sortMode?: "default" | "newest" | "cheapest" | "closest",
  options?: {
    visualProfile?: VisualSearchProfile | null;
    visualRankScores?: Record<string, number>;
  }
): ScoredListing[] {
  const active = listings.filter(isListingActive);
  const visualProfile = options?.visualProfile ?? null;
  const visualRankScores = options?.visualRankScores ?? {};
  const useVisual = Boolean(visualProfile);
  const baseWeights = getScoringWeights(query);
  const w = useVisual
    ? { semantic: 0.25, proximity: 0.15, price: 0.15, recency: 0.05, visual: 0.4 }
    : { ...baseWeights, visual: 0 };

  let results = active
    .map((listing) => {
      const semanticRelevance = computeSemanticRelevance(query, listing);
      const proximityScore = computeProximityScore(listing.distanceKm);
      const priceAttractiveness = computePriceAttractiveness(listing, query);
      const recencyScore = computeRecencyScore(listing.createdAt);
      const visualRelevance = visualProfile
        ? (() => {
            const local = computeVisualRelevance(visualProfile, listing);
            const remote = visualRankScores[listing.id];
            return remote !== undefined ? local * 0.45 + remote * 0.55 : local;
          })()
        : 0;

      const score =
        semanticRelevance * w.semantic +
        proximityScore * w.proximity +
        priceAttractiveness * w.price +
        recencyScore * w.recency +
        visualRelevance * (w.visual ?? 0) +
        visibilityBoostScore(listing);

      return {
        ...listing,
        score,
        semanticRelevance,
        proximityScore,
        priceAttractiveness,
        recencyScore,
        visualRelevance,
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

  const q = query.trim();
  if (q) {
    const relevant = results.filter(
      (l) => l.semanticRelevance >= MIN_QUERY_RELEVANCE
    );
    if (relevant.length > 0) results = relevant;
  }

  return results;
}

export function generateDynamicFilters(query: string): DynamicFilter[] {
  const q = query.toLowerCase();
  const filters: DynamicFilter[] = [];

  if (/auto|mašin|golf|opel|vw|ratlank|padang|r16|r17/i.test(q)) {
    filters.push(
      {
        id: "under-5k",
        label: "Iki 5000€",
        apply: (l) => l.category === "vehicles" && l.price <= 5000,
      },
      {
        id: "auto-parts",
        label: "Auto dalys",
        apply: (l) =>
          l.category === "vehicles" &&
          /ratlank|padang|dal|r16|r17|felg/i.test(
            [l.title, l.description ?? "", ...l.tags].join(" ")
          ),
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

/** Buyer wants to find listings — must never open seller upload flow */
export function isBuyerSearchIntent(text: string): boolean {
  const q = text.toLowerCase().trim();
  if (!q) return false;

  const buyerPatterns = [
    /\bkas\s+parduod/i,
    /\bgal\s+kas\s+parduod/i,
    /\bkur\s+(nusipirkti|įsigyti|isigyti|rasti|galima\s+pirkti|pirkti|gauti)/i,
    /\b(rask|surask|ieškau|ieskau|ieškot|ieskot)\b/i,
    /\bnoriu\s+pirkti\b/i,
    /\bnorėčiau\s+pirkti\b/i,
    /\bnoreciau\s+pirkti\b/i,
    /\bkas\s+turi\b/i,
    /\bar\s+(yra|turite|galite\s+parduoti)\b/i,
    /\bparodyk\b/i,
    /\brodyti\b/i,
    /\bpaiešk\w*/i,
    /\bpaiesk\w*/i,
  ];

  return buyerPatterns.some((re) => re.test(q));
}

/** User wants to post a listing (sell, offer job, offer services) — not browse */
export function detectSellerListingIntent(text: string): boolean {
  const q = text.toLowerCase().trim();
  if (!q) return false;
  if (isBuyerSearchIntent(q)) return false;

  const sellerPatterns = [
    /\bparduodu\b/,
    /\bparduosiu\b/,
    /\bnoriu\s+parduot/i,
    /\bįdėti\s+skelb/i,
    /\bideti\s+skelb/i,
    /\bnaujas\s+skelb/i,
    /\bsiūlau\s+darb/i,
    /\bsiulau\s+darb/i,
    /\bieškau\s+darbo\b/i,
    /\bieskau\s+darbo\b/i,
    /\bsiūlau\s+paslaug/i,
    /\bsiulau\s+paslaug/i,
    /\bteikiu\s+paslaug/i,
    /\bnuomoju\b/,
    /\bišnuomoju\b/,
    /\bisnuomoju\b/,
    /\bnoriu\s+įdėti\b/i,
    /\bnoriu\s+ideti\b/i,
    /\bnoriu\s+parduoti\b/i,
    /\bnoriu\s+kelti\s+skelb/i,
    /\bkeliu\s+skelb/i,
    /\bnoriu\s+skelbt/i,
    /\bkelti\s+skelb/i,
    /\bnoriu\s+įkelti\s+skelb/i,
    /\bnoriu\s+ikelti\s+skelb/i,
  ];

  return sellerPatterns.some((re) => re.test(q));
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
