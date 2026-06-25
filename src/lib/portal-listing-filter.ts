import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import type { Listing, ListingCategory, ScoredListing } from "@/lib/types";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import { isVehicleQuery } from "@/lib/vehicle-keywords";

/** Categories shown for each portal theme in search/buddy/broker. */
export function categoriesForPortal(theme: ChameleonThemeId): string[] | null {
  switch (theme) {
    case "autoplius":
      return ["vehicles"];
    case "cvbankas":
      return ["jobs"];
    case "aruodas":
      return ["real_estate"];
    case "vinted":
      return ["clothing"];
    case "paslaugos":
      return ["services"];
    case "skelbiu":
      return ["electronics", "home", "other"];
    default:
      return null;
  }
}

export function portalThemeForQuery(query: string): ChameleonThemeId {
  return portalExperienceForQuery(query).theme;
}

/** Strict category from query keywords (APRANGA → clothing, etc.). */
export function inferStrictCategory(query: string): ListingCategory | null {
  const q = query.toLowerCase();
  if (isVehicleQuery(q)) {
    return "vehicles";
  }
  if (/bat|batai|keden|aulis|drabu|striuk|suknel|palt|dydis|zara|nike|vinted|aprang/i.test(q)) {
    return "clothing";
  }
  if (/but|nam|nuom|sklyp|kamb|nt\b|nekilnoj|aruod/i.test(q)) {
    return "real_estate";
  }
  if (/meistr|paslaug|elektrik|santechn|valym|remont/i.test(q)) {
    return "services";
  }
  if (/darbas|atlygin|cv\b|vairuotoj|sand[eė]l/i.test(q)) {
    return "jobs";
  }
  if (/telefon|iphone|samsung|laptop|kompiuter/i.test(q)) {
    return "electronics";
  }
  if (/bald|sofa|komod|virtuv/i.test(q)) {
    return "home";
  }
  return null;
}

export function filterListingsForPortal<T extends Listing>(
  query: string,
  listings: T[]
): T[] {
  const theme = portalThemeForQuery(query);
  const cats = categoriesForPortal(theme);
  let filtered = cats ? listings.filter((l) => cats.includes(l.category)) : listings;

  const strict = inferStrictCategory(query);
  if (strict) {
    filtered = filtered.filter((l) => l.category === strict);
  }

  return filtered;
}

export function portalRankedListings(
  query: string,
  listings: ScoredListing[]
): ScoredListing[] {
  return filterListingsForPortal(query, listings);
}

/** Sanitize search query — never show literal "undefined" / "null". */
export function sanitizeSearchQuery(
  raw: string,
  mode: "live" | "final" = "live"
): string {
  let q = String(raw ?? "").replace(/\bundefined\b/gi, "");
  if (q === "null") return "";
  q = q.replace(/ {2,}/g, " ");
  if (mode === "final") return q.trim();
  return q.replace(/^\s+/, "");
}
