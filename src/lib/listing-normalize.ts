import type { LegacyListingInput, Listing } from "@/lib/types";
import { enrichListingCoords } from "@/lib/geocoding";
import {
  filterSessionListingImages,
  listingImagesFromLegacy,
  resolveListingImages,
} from "@/lib/listing-image";
import { generateListingSlug } from "@/lib/seo";
import { isDemoListingId } from "@/lib/demo-catalog";

/** Ensure API/local listings have slug + coordinates for feed ranking */
export function normalizeListing(listing: LegacyListingInput): Listing {
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  const sellerImages = filterSessionListingImages(listingImagesFromLegacy(listing));
  const base = enrichListingCoords({
    ...listing,
    images: sellerImages,
  } as Listing);
  const isDemo = Boolean((listing as Listing).isDemo) || isDemoListingId(String(listing.id ?? ""));
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
    // Real seller listings keep only their uploads — never inject Unsplash fillers.
    images:
      sellerImages.length > 0
        ? sellerImages
        : isDemo
          ? resolveListingImages({ ...base, images: [] })
          : [],
  };
}

export function normalizeListings(listings: Listing[]): Listing[] {
  return listings.map(normalizeListing);
}
