import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import type { Listing, ScoredListing } from "@/lib/types";
import { portalExperienceForQuery } from "@/lib/portal-experience";

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

export function filterListingsForPortal<T extends Listing>(
  query: string,
  listings: T[]
): T[] {
  const theme = portalThemeForQuery(query);
  const cats = categoriesForPortal(theme);
  if (!cats) return listings;
  return listings.filter((l) => cats.includes(l.category));
}

export function portalRankedListings(
  query: string,
  listings: ScoredListing[]
): ScoredListing[] {
  return filterListingsForPortal(query, listings);
}

/** Sanitize search query — never show literal "undefined" / "null". */
export function sanitizeSearchQuery(raw: string): string {
  const q = String(raw ?? "").trim();
  if (!q || q === "undefined" || q === "null") return "";
  return q.replace(/\bundefined\b/gi, "").replace(/\s+/g, " ").trim();
}
