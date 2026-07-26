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
  const attrs = ((listing as Listing).attributes ?? {}) as Record<string, unknown>;
  const expiresRaw = attrs["_visibilityExpiresAt"];
  const visibilityExpiresAt =
    (listing as Listing).visibilityExpiresAt ??
    (typeof expiresRaw === "string" ? expiresRaw : undefined);
  const tierRaw = attrs["_visibilityTier"];
  const tierNum =
    typeof tierRaw === "number"
      ? tierRaw
      : typeof tierRaw === "string"
        ? parseInt(tierRaw, 10)
        : NaN;
  const visibilityPlanTier =
    (listing as Listing).visibilityPlanTier ??
    (tierNum >= 1 && tierNum <= 5
      ? (tierNum as Listing["visibilityPlanTier"])
      : undefined);
  let visibilityTier = (listing as Listing).visibilityTier;
  if (!visibilityTier && visibilityPlanTier) {
    visibilityTier = visibilityPlanTier >= 2 ? "top" : "plus";
  }
  return {
    ...base,
    slug,
    visibilityExpiresAt,
    visibilityPlanTier,
    visibilityTier,
    isAiTwinActive:
      String(attrs["isAiTwinActive"] ?? "").trim().toLowerCase() === "true",
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
