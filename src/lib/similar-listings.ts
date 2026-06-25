import type { Listing } from "@/lib/types";
import { isListingActive } from "@/lib/seller-display";

function tagOverlap(a: Listing, b: Listing): number {
  const setB = new Set(b.tags.map((t) => t.toLowerCase()));
  return a.tags.filter((t) => setB.has(t.toLowerCase())).length;
}

/** Same-category suggestions for listing detail (Marktplaats-style). */
export function getSimilarListings(
  current: Listing,
  pool: Listing[],
  limit = 12
): Listing[] {
  return pool
    .filter(
      (l) =>
        l.id !== current.id &&
        l.category === current.category &&
        isListingActive(l)
    )
    .map((l) => ({
      listing: l,
      score:
        tagOverlap(current, l) * 3 +
        (l.location.split(",")[0] === current.location.split(",")[0] ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.listing.createdAt.localeCompare(a.listing.createdAt))
    .slice(0, limit)
    .map((x) => x.listing);
}
