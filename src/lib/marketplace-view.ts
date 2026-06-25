import type { Listing, ListingCategory } from "@/lib/types";
import type { ScoredListing } from "@/lib/types";

export type MarketplaceViewMode = "list" | "grid" | "map";

export type MarketplaceConditionFilter = "all" | "new" | "used";

export interface MarketplaceFilterState {
  category: ListingCategory | "all";
  location: string;
  priceMin: number | null;
  priceMax: number | null;
  condition: MarketplaceConditionFilter;
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilterState = {
  category: "all",
  location: "",
  priceMin: null,
  priceMax: null,
  condition: "all",
};

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
  filters: MarketplaceFilterState
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

  return results;
}

export function formatResultsLabel(searchQuery: string, count: number): string {
  const q = searchQuery.trim();
  if (!q) return `Skelbimai Lietuvoje: ${count} rezultatų`;
  return `${q}: ${count} ${count === 1 ? "rezultatas" : "rezultatai"}`;
}
