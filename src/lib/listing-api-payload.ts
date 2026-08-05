import { resolveListingCity } from "@/lib/city-resolve";
import type { ListingEditPatch } from "@/lib/listing-edit";
import type { LegacyListingInput, Listing } from "@/lib/types";
import { hardFilterPublicGalleryUrls } from "@/lib/listing-gallery-roles";
import { sanitizeListingAttributesForPersistence, resolveListingApiCover } from "@vauto/shared/listing-attributes-sanitize";
import { capListingGalleryUrls } from "@vauto/shared/listing-photo-policy";

/** Server API expects singular `image`; client models use `images[]`. */
export function listingToApiPayload(
  listing: Listing
): Omit<Listing, "images"> & { image: string; images?: string[] } {
  const { images, ...rest } = listing;
  const attributes = sanitizeListingAttributesForPersistence(
    typeof rest.attributes === "object" && rest.attributes
      ? { ...rest.attributes }
      : {}
  );
  // Persist AI twin activation inside attributes (DB stores attributes as jsonb).
  if (listing.isAiTwinActive === true) {
    attributes.isAiTwinActive = "true";
  }
  // Never ship extra base64 blobs in attributes / payload — only http gallery URLs.
  // Hard-exclude tech passport / document evidence from public gallery + cover.
  // Documents stay in attributes.documentImageUrls as verification metadata only.
  const gallery = capListingGalleryUrls(
    hardFilterPublicGalleryUrls(images, undefined, attributes),
    listing.category
  ).filter((u: string) => !/unsplash\.com|picsum\.photos/i.test(u));
  const { cover, httpGallery } = resolveListingApiCover(gallery);
  if (httpGallery.length >= 1) {
    attributes.galleryUrls = httpGallery;
  }
  // Never mirror a document URL into the public galleryUrls attribute.
  if (Array.isArray(attributes.galleryUrls)) {
    attributes.galleryUrls = hardFilterPublicGalleryUrls(
      attributes.galleryUrls as string[],
      undefined,
      attributes
    );
  }
  for (const key of Object.keys(attributes)) {
    const val = attributes[key];
    if (typeof val === "string" && val.startsWith("data:image")) {
      delete attributes[key];
    }
  }
  return {
    ...rest,
    attributes,
    location: resolveListingCity(listing.location),
    image: cover,
    // Always persist full HTTP gallery so multi-photo listings keep every upload.
    // Data-only covers are rejected at publish — feed blanks data: URLs.
    ...(httpGallery.length ? { images: httpGallery } : {}),
    allowPastomatas: listing.allowPastomatas ?? true,
  };
}

export function listingPatchToApiPayload(
  patch: ListingEditPatch & Partial<Pick<Listing, "banned" | "requiresReview">>
): Record<string, unknown> {
  const { images, ...rest } = patch;
  const out: Record<string, unknown> = { ...rest };
  if (out.attributes !== undefined) {
    out.attributes = sanitizeListingAttributesForPersistence(out.attributes);
  }
  if (images !== undefined) {
    const gallery = images
      .map((u: string | undefined | null) => String(u ?? "").trim())
      .filter((u: string) => /^https?:\/\//i.test(u) && !/unsplash\.com|picsum\.photos/i.test(u));
    // PATCH cover must be HTTPS only — never fall back to data:/blob (no server materialize).
    out.image = gallery[0] ?? "";
    out.images = gallery;
    const attrs = sanitizeListingAttributesForPersistence(
      out.attributes && typeof out.attributes === "object"
        ? (out.attributes as Record<string, unknown>)
        : {}
    );
    out.attributes = {
      ...attrs,
      ...(gallery.length ? { galleryUrls: gallery } : {}),
    };
  }
  if (typeof (patch as Listing).isAiTwinActive === "boolean") {
    const attrs = sanitizeListingAttributesForPersistence(
      out.attributes && typeof out.attributes === "object"
        ? (out.attributes as Record<string, unknown>)
        : {}
    );
    out.attributes = {
      ...attrs,
      isAiTwinActive: (patch as Listing).isAiTwinActive ? "true" : "false",
    };
  }
  return out;
}

export function isApiListingShape(
  value: Listing | LegacyListingInput
): value is LegacyListingInput & { image?: string } {
  return typeof (value as LegacyListingInput).image === "string";
}
