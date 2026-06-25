import type { LegacyListingInput, Listing } from "@/lib/types";
import { enrichListingCoords } from "@/lib/geocoding";
import {
  listingImagesFromLegacy,
  resolveListingImages,
} from "@/lib/listing-image";
import { generateListingSlug } from "@/lib/seo";

/** Ensure API/local listings have slug + coordinates for feed ranking */
export function normalizeListing(listing: LegacyListingInput): Listing {
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  const base = enrichListingCoords({
    ...listing,
    images: listingImagesFromLegacy(listing),
  } as Listing);
  return {
    ...base,
    slug,
    images: resolveListingImages(base),
  };
}

export function normalizeListings(listings: Listing[]): Listing[] {
  return listings.map(normalizeListing);
}
