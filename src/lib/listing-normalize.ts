import type { LegacyListingInput, Listing } from "@/lib/types";
import { enrichListingCoords } from "@/lib/geocoding";
import {
  filterSessionListingImages,
  listingImagesFromLegacy,
  resolveListingImages,
} from "@/lib/listing-image";
import { generateListingSlug } from "@/lib/seo";
import { isDemoListingId } from "@/lib/demo-catalog";
import {
  feedBadgeForPlanTier,
  stripExpiredVisibilityAttributes,
  VISIBILITY_EXPIRES_ATTR,
  VISIBILITY_TIER_ATTR,
} from "@vauto/shared/promote-catalog";

/** Ensure API/local listings have slug + coordinates for feed ranking */
export function normalizeListing(listing: LegacyListingInput): Listing {
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  const sellerImages = filterSessionListingImages(listingImagesFromLegacy(listing));
  const base = enrichListingCoords({
    ...listing,
    images: sellerImages,
  } as Listing);
  const isDemo = Boolean((listing as Listing).isDemo) || isDemoListingId(String(listing.id ?? ""));
  const rawAttrs = ((listing as Listing).attributes ?? {}) as Record<string, unknown>;
  const stripped = stripExpiredVisibilityAttributes(
    rawAttrs,
    Boolean((listing as Listing).promoted)
  );
  const attrs = (stripped.attributes ?? {}) as Record<string, unknown>;
  const expiresRaw = attrs[VISIBILITY_EXPIRES_ATTR];
  const visibilityExpiresAt =
    typeof expiresRaw === "string"
      ? expiresRaw
      : stripped.promoted
        ? (listing as Listing).visibilityExpiresAt
        : undefined;
  const tierRaw = attrs[VISIBILITY_TIER_ATTR];
  const tierNum =
    typeof tierRaw === "number"
      ? tierRaw
      : typeof tierRaw === "string"
        ? parseInt(tierRaw, 10)
        : NaN;
  const visibilityPlanTier =
    tierNum >= 1 && tierNum <= 5
      ? (tierNum as Listing["visibilityPlanTier"])
      : stripped.promoted
        ? (listing as Listing).visibilityPlanTier
        : undefined;
  let visibilityTier = (listing as Listing).visibilityTier;
  if (!stripped.promoted && visibilityExpiresAt == null && tierNum >= 1) {
    visibilityTier = "free";
  } else if (visibilityPlanTier) {
    visibilityTier = feedBadgeForPlanTier(visibilityPlanTier);
  } else if (!stripped.promoted) {
    // Clear stale badge when expiry stripped
    if (visibilityTier === "top" || visibilityTier === "plus") {
      const hadExpiry =
        typeof rawAttrs[VISIBILITY_EXPIRES_ATTR] === "string";
      if (hadExpiry) visibilityTier = "free";
    }
  }
  return {
    ...base,
    slug,
    promoted: stripped.promoted,
    attributes: stripped.attributes as Listing["attributes"],
    visibilityExpiresAt: stripped.promoted ? visibilityExpiresAt : undefined,
    visibilityPlanTier: stripped.promoted ? visibilityPlanTier : undefined,
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
