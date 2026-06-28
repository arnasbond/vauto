import type { Listing } from "@/lib/types";
import type { MarketplaceSortMode } from "@/lib/marketplace-view";

/** Instant client-side sort for marketplace grid. */
export function sortListingsFast<T extends Listing>(
  listings: T[],
  mode: Exclude<MarketplaceSortMode, "relevance">
): T[] {
  const copy = [...listings];
  if (mode === "cheapest") {
    return copy.sort((a, b) => a.price - b.price);
  }
  if (mode === "newest") {
    return copy.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  return copy.sort((a, b) => a.distanceKm - b.distanceKm);
}
