import { resolveListingCity } from "@/lib/city-resolve";
import type { ListingEditPatch } from "@/lib/listing-edit";
import type { LegacyListingInput, Listing } from "@/lib/types";

/** Server API expects singular `image`; client models use `images[]`. */
export function listingToApiPayload(
  listing: Listing
): Omit<Listing, "images"> & { image: string; images?: string[] } {
  const { images, ...rest } = listing;
  const attributes =
    typeof rest.attributes === "object" && rest.attributes
      ? { ...rest.attributes }
      : {};
  // Persist AI twin activation inside attributes (DB stores attributes as jsonb).
  if (listing.isAiTwinActive === true) {
    attributes.isAiTwinActive = "true";
  }
  // Never ship extra base64 blobs in attributes / payload — only http gallery URLs.
  const gallery = (images ?? [])
    .map((u) => String(u ?? "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const cover = gallery[0] ?? "";
  const httpGallery = gallery.filter((u) => /^https?:\/\//i.test(u));
  if (httpGallery.length > 1) {
    attributes.galleryUrls = httpGallery;
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
    // Server sanitizer maps images[] → cover + attributes.galleryUrls (http only).
    ...(httpGallery.length > 1 ? { images: httpGallery } : {}),
    allowPastomatas: listing.allowPastomatas ?? true,
  };
}

export function listingPatchToApiPayload(
  patch: ListingEditPatch & Partial<Pick<Listing, "banned" | "requiresReview">>
): Record<string, unknown> {
  const { images, ...rest } = patch;
  const out: Record<string, unknown> = { ...rest };
  if (images !== undefined) {
    out.image = images[0]?.trim() ?? "";
  }
  if ((patch as Listing).isAiTwinActive === true) {
    const attrs =
      out.attributes && typeof out.attributes === "object"
        ? (out.attributes as Record<string, unknown>)
        : {};
    out.attributes = { ...attrs, isAiTwinActive: "true" };
  }
  return out;
}

export function isApiListingShape(
  value: Listing | LegacyListingInput
): value is LegacyListingInput & { image?: string } {
  return typeof (value as LegacyListingInput).image === "string";
}
