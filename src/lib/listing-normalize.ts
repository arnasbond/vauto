import type { LegacyListingInput, Listing } from "@/lib/types";
import { enrichListingCoords } from "@/lib/geocoding";
import {
  listingImagesFromLegacy,
  resolveListingImages,
} from "@/lib/listing-image";
import { parseGalleryImagesAttribute } from "@/lib/listing-api-payload";
import { publicListingImageUrls } from "@/lib/listing-public-gallery";
import { generateListingSlug } from "@/lib/seo";

/** Ensure API/local listings have slug + coordinates for feed ranking */
export function normalizeListing(listing: LegacyListingInput): Listing {
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  const fromLegacy = listingImagesFromLegacy(listing);
  const fromGalleryAttr = parseGalleryImagesAttribute(
    (listing as Listing).attributes as Record<string, string | string[] | undefined>
  );
  const sellerImages = (fromGalleryAttr.length ? fromGalleryAttr : fromLegacy).filter(
    Boolean
  );
  // Prefer cover from singular image if gallery attr missing it.
  const cover =
    typeof (listing as { image?: string }).image === "string"
      ? String((listing as { image?: string }).image).trim()
      : "";
  const withCover =
    cover && !sellerImages.includes(cover)
      ? [cover, ...sellerImages].slice(0, 6)
      : sellerImages.length
        ? sellerImages
        : cover
          ? [cover]
          : [];

  const base = enrichListingCoords({
    ...listing,
    images: withCover,
  } as Listing);
  const withMeta: Listing = {
    ...base,
    slug,
    isAiTwinActive:
      String((listing as Listing).attributes?.["isAiTwinActive"] ?? "").trim().toLowerCase() ===
      "true",
    allowPastomatas:
      typeof (listing as Listing).allowPastomatas === "boolean"
        ? (listing as Listing).allowPastomatas
        : true,
    images: withCover.length > 0 ? withCover : resolveListingImages({ ...base, images: [] }),
  };

  // Drop tech-pasas / reorder cover when Vision metadata is present on the listing.
  const publicImages = publicListingImageUrls(withMeta);
  if (
    publicImages.length > 0 &&
    (withMeta.attributes?.photoRoles ||
      withMeta.attributes?.excludedGalleryImageUrls ||
      withMeta.attributes?.coverImageUrl)
  ) {
    return { ...withMeta, images: publicImages };
  }

  return withMeta;
}

export function normalizeListings(listings: Listing[]): Listing[] {
  return listings.map(normalizeListing);
}
