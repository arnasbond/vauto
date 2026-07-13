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
  const sellerImages = listingImagesFromLegacy(listing);
  const base = enrichListingCoords({
    ...listing,
    images: sellerImages,
  } as Listing);
  return {
    ...base,
    slug,
    isAiTwinActive:
      String((listing as Listing).attributes?.["isAiTwinActive"] ?? "").trim().toLowerCase() ===
      "true",
    allowPastomatas:
      typeof (listing as Listing).allowPastomatas === "boolean"
        ? (listing as Listing).allowPastomatas
        : true,
    // Keep real seller uploads (https, data:, blob:) — demo gallery only when empty.
    images: sellerImages.length > 0 ? sellerImages : resolveListingImages({ ...base, images: [] }),
  };
}

export function normalizeListings(listings: Listing[]): Listing[] {
  return listings.map(normalizeListing);
}
