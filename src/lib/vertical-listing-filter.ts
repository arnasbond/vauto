import type { VerticalPresentationId } from "@/lib/vertical-presentation";
import type { Listing, ListingCategory, ScoredListing } from "@/lib/types";
import { verticalExperienceForQuery } from "@/lib/vertical-presentation";
import { isJobSearchQuery } from "@/lib/universal-search-intent";
import { isVehicleQuery } from "@/lib/vehicle-keywords";

/**
 * VAUTO-native vertical listing filtering (Stage 20B.1).
 *
 * Legacy "portal" naming removed — this module adapts a query to the active
 * vertical's category scope without imitating any external marketplace portal.
 */

/** Categories shown for each vertical in search/buddy/broker. */
export function categoriesForVertical(
  vertical: VerticalPresentationId
): string[] | null {
  switch (vertical) {
    case "transport":
      return ["vehicles"];
    case "jobs":
      return ["jobs"];
    case "real_estate":
      return ["real_estate"];
    case "fashion":
      return ["clothing"];
    case "services":
      return ["services"];
    case "goods":
      return ["electronics", "home", "other"];
    default:
      return null;
  }
}

export function verticalIdForQuery(query: string): VerticalPresentationId {
  return verticalExperienceForQuery(query).vertical;
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
  if (isJobSearchQuery(q)) {
    return "jobs";
  }
  if (/darbas|darbo|atlygin|cv\b|vairuotoj|sand[eė]l|vakancij|karjer/i.test(q)) {
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

export function filterListingsForVertical<T extends Listing>(
  query: string,
  listings: T[]
): T[] {
  const vertical = verticalIdForQuery(query);
  const cats = categoriesForVertical(vertical);
  let filtered = cats ? listings.filter((l) => cats.includes(l.category)) : listings;

  const strict = inferStrictCategory(query);
  if (strict) {
    filtered = filtered.filter((l) => l.category === strict);
  }

  return filtered;
}

export function verticalRankedListings(
  query: string,
  listings: ScoredListing[]
): ScoredListing[] {
  return filterListingsForVertical(query, listings);
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
