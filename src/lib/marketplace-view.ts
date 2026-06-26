import type { Listing, ListingCategory } from "@/lib/types";
import {
  applyCategoryAttributeFilters,
  EMPTY_CATEGORY_ATTRIBUTE_FILTERS,
  type CategoryAttributeFilters,
} from "@/lib/category-attribute-filters";
import type { ScoredListing } from "@/lib/types";
import { distanceKm, type UserCoords } from "@/lib/geolocation";
import { coordsForLtCity, detectCityInText } from "@/lib/lt-cities";
import { sortListingsFast } from "@/lib/fast-agent-search";
import type { AgentSearchFilters } from "@/lib/vauto-agent-client";
import { portalExperienceForQuery } from "@/lib/portal-experience";

export type MarketplaceViewMode = "list" | "grid" | "map";

export type MarketplaceSortMode = "relevance" | "cheapest" | "newest" | "closest";

export const MARKETPLACE_SORT_OPTIONS: Array<{
  id: MarketplaceSortMode;
  label: string;
}> = [
  { id: "relevance", label: "Relevantiškiausi" },
  { id: "cheapest", label: "Pigiausi viršuje" },
  { id: "newest", label: "Naujausi viršuje" },
  { id: "closest", label: "Arti manęs" },
];

export type MarketplaceConditionFilter = "all" | "new" | "used";

export type MarketplaceRadiusKm = 5 | 10 | 20 | 50;

export const MARKETPLACE_RADIUS_OPTIONS: Array<{
  km: MarketplaceRadiusKm | null;
  label: string;
}> = [
  { km: null, label: "Visa Lietuva" },
  { km: 5, label: "+5 km" },
  { km: 10, label: "+10 km" },
  { km: 20, label: "+20 km" },
  { km: 50, label: "+50 km" },
];

export interface MarketplaceFilterState {
  category: ListingCategory | "all";
  location: string;
  priceMin: number | null;
  priceMax: number | null;
  condition: MarketplaceConditionFilter;
  sort: MarketplaceSortMode;
  /** Haversine radius from location city center or buyer GPS */
  radiusKm: MarketplaceRadiusKm | null;
  /** Chameleon category-specific attribute filters (Auto, NT, Drabužiai, Darbas) */
  categoryAttributes: CategoryAttributeFilters;
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilterState = {
  category: "all",
  location: "",
  priceMin: null,
  priceMax: null,
  condition: "all",
  sort: "relevance",
  radiusKm: null,
  categoryAttributes: { ...EMPTY_CATEGORY_ATTRIBUTE_FILTERS },
};

/** When category is „all“, infer Chameleon attribute filters from active portal/search. */
export function effectiveChameleonCategory(
  category: ListingCategory | "all",
  searchQuery: string
): ListingCategory | "all" {
  if (category !== "all") return category;
  const theme = portalExperienceForQuery(searchQuery).theme;
  switch (theme) {
    case "autoplius":
      return "vehicles";
    case "aruodas":
      return "real_estate";
    case "vinted":
      return "clothing";
    case "cvbankas":
      return "jobs";
    case "paslaugos":
      return "services";
    default:
      return "all";
  }
}

/** Ensure persisted/partial filter objects always include sort and valid fields */
export function normalizeMarketplaceFilters(
  filters: Partial<MarketplaceFilterState> | MarketplaceFilterState
): MarketplaceFilterState {
  const sort = filters.sort;
  const validSort =
    sort === "cheapest" ||
    sort === "newest" ||
    sort === "closest" ||
    sort === "relevance"
      ? sort
      : "relevance";

  const radius = filters.radiusKm;
  const validRadius =
    radius === 5 || radius === 10 || radius === 20 || radius === 50
      ? radius
      : null;

  return {
    category: filters.category ?? "all",
    location: filters.location ?? "",
    priceMin: filters.priceMin ?? null,
    priceMax: filters.priceMax ?? null,
    condition: filters.condition ?? "all",
    sort: validSort,
    radiusKm: validRadius,
    categoryAttributes: {
      ...EMPTY_CATEGORY_ATTRIBUTE_FILTERS,
      ...(filters.categoryAttributes ?? {}),
    },
  };
}

/** Snap agent/voice radius to nearest Marktplaats-style option */
export function snapRadiusKm(km: number): MarketplaceRadiusKm {
  if (km <= 5) return 5;
  if (km <= 10) return 10;
  if (km <= 20) return 20;
  return 50;
}

/** Merge Gemini/fast-agent filters into FilterBar state (AND — never overwrite unrelated fields) */
export function mergeAgentIntoMarketplaceFilters(
  current: MarketplaceFilterState,
  agent?: AgentSearchFilters | null,
  options?: {
    /** Clear geo/condition when the new query omits them (fresh product search) */
    resetAbsentGeo?: boolean;
    resetAbsentCondition?: boolean;
  }
): MarketplaceFilterState {
  if (!agent) return normalizeMarketplaceFilters(current);

  let base: MarketplaceFilterState = { ...current };

  if (options?.resetAbsentGeo) {
    if (!agent.city) {
      base = { ...base, location: "", radiusKm: null };
    } else if (agent.radiusKm == null) {
      base = { ...base, radiusKm: null };
    }
  }

  if (options?.resetAbsentCondition && !agent.condition) {
    base = { ...base, condition: "all" };
  }

  if (agent.category && agent.category !== current.category) {
    base = { ...base, categoryAttributes: { ...EMPTY_CATEGORY_ATTRIBUTE_FILTERS } };
  }

  return normalizeMarketplaceFilters({
    ...base,
    ...(agent.category ? { category: agent.category as ListingCategory } : {}),
    ...(agent.city ? { location: agent.city } : {}),
    ...(agent.minPrice != null ? { priceMin: agent.minPrice } : {}),
    ...(agent.maxPrice != null ? { priceMax: agent.maxPrice } : {}),
    ...(agent.radiusKm != null ? { radiusKm: snapRadiusKm(agent.radiusKm) } : {}),
    ...(agent.condition ? { condition: agent.condition } : {}),
  });
}

/** Center for radius filter: selected city, else buyer GPS */
export function resolveRadiusCenter(
  filters: MarketplaceFilterState,
  buyerCoords: UserCoords | null
): UserCoords | null {
  if (filters.location.trim()) {
    const city = coordsForLtCity(filters.location.trim());
    if (city) return city;
  }
  return buyerCoords;
}

function listingCoords(listing: Listing): UserCoords | null {
  if (listing.latitude != null && listing.longitude != null) {
    return { lat: listing.latitude, lng: listing.longitude };
  }
  const direct = coordsForLtCity(listing.location);
  if (direct) return direct;
  const city = detectCityInText(listing.location);
  return city ? coordsForLtCity(city) : null;
}

const VIEW_MODE_MAP: Array<[RegExp, MarketplaceViewMode]> = [
  [/\b(žem[eė]lapyje|zemelapyje|ant\s+žem[eė]lapio|map\s*view|show\s+map)\b/i, "map"],
  [/\b(parodyk|rodyti|perjunk)\s+.*žem[eė]lap/i, "map"],
  [/\b(sąraš(e|ą)|sarase|list\s*view|rodyti\s+sąraš)/i, "list"],
  [/\b(tinklel(į|yje)?|grid|kortel(e|ių|es))\b/i, "grid"],
];

export function parseViewModeIntent(text: string): MarketplaceViewMode | null {
  const t = text.trim();
  if (!t) return null;
  for (const [pattern, mode] of VIEW_MODE_MAP) {
    if (pattern.test(t)) return mode;
  }
  return null;
}

/** Pure view switch without a product search (e.g. „parodyk žemėlapyje“). */
export function isViewModeOnlyCommand(text: string): boolean {
  const viewIntent = parseViewModeIntent(text);
  if (!viewIntent) return false;
  const t = text.trim();
  if (!/^(parodyk|rodyti|perjunk)\b/i.test(t)) return false;
  return !/\b(ieškau|ieskau|rask|surask|volvo|bmw|audi|vw|toyota|mercedes|iphone|butas|darbas)\b/i.test(
    t
  );
}

function normLoc(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function listingCondition(listing: Listing): "new" | "used" | "unknown" {
  const raw =
    listing.attributes?.condition ??
    listing.attributes?.būklė ??
    listing.attributes?.bukle;
  const text = String(raw ?? listing.description ?? "").toLowerCase();
  if (/\b(naujas|nauja|new|sealed)\b/.test(text)) return "new";
  if (/\b(naudot|gera|puiki|used)\b/.test(text)) return "used";
  return "unknown";
}

export function applyMarketplaceFilters(
  listings: ScoredListing[],
  filters: MarketplaceFilterState,
  buyerCoords: UserCoords | null = null
): ScoredListing[] {
  let results = listings;

  if (filters.category !== "all") {
    results = results.filter((l) => l.category === filters.category);
  }

  const loc = normLoc(filters.location);
  if (loc) {
    results = results.filter((l) => normLoc(l.location).includes(loc));
  }

  if (filters.priceMin != null) {
    results = results.filter((l) => l.price >= filters.priceMin!);
  }
  if (filters.priceMax != null) {
    results = results.filter((l) => l.price > 0 && l.price <= filters.priceMax!);
  }

  if (filters.condition === "new") {
    results = results.filter((l) => listingCondition(l) === "new");
  } else if (filters.condition === "used") {
    results = results.filter((l) => {
      const c = listingCondition(l);
      return c === "used" || c === "unknown";
    });
  }

  if (filters.radiusKm != null) {
    const center = resolveRadiusCenter(filters, buyerCoords);
    if (center) {
      const maxKm = filters.radiusKm;
      results = results.filter((l) => {
        const coords = listingCoords(l);
        if (!coords) return false;
        return distanceKm(center, coords) <= maxKm;
      });
    }
  }

  results = applyCategoryAttributeFilters(
    results,
    filters.category,
    filters.categoryAttributes
  );

  return results;
}

export function applyMarketplaceSort<T extends Listing>(
  listings: T[],
  sort: MarketplaceSortMode
): T[] {
  if (sort === "relevance") return listings;
  return sortListingsFast(listings, sort);
}

export function formatResultsLabel(searchQuery: string, count: number): string {
  const q = searchQuery.trim();
  if (!q) return `Skelbimai Lietuvoje: ${count} rezultatų`;
  return `${q}: ${count} ${count === 1 ? "rezultatas" : "rezultatai"}`;
}
