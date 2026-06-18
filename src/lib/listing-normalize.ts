import type { Listing } from "@/lib/types";
import { enrichListingCoords } from "@/lib/geocoding";
import { generateListingSlug } from "@/lib/seo";

/** Ensure API/local listings have slug + coordinates for feed ranking */
export function normalizeListing(listing: Listing): Listing {
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  return enrichListingCoords({ ...listing, slug });
}

export function normalizeListings(listings: Listing[]): Listing[] {
  return listings.map(normalizeListing);
}
