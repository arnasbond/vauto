import { resolveListingCity } from "@/lib/city-resolve";
import type { ListingEditPatch } from "@/lib/listing-edit";
import type { LegacyListingInput, Listing } from "@/lib/types";

export const GALLERY_IMAGES_ATTR = "galleryImages";

function uniqueImageUrls(urls: string[]): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const u = String(raw ?? "").trim();
    if (u && !out.includes(u)) out.push(u);
  }
  return out.slice(0, 6);
}

/** Persist full public gallery in attributes (DB has singular `image` column only). */
export function galleryImagesAttributeValue(images: string[] | undefined): string {
  return JSON.stringify(uniqueImageUrls(images ?? []));
}

export function parseGalleryImagesAttribute(
  attributes?: Record<string, string | string[] | undefined> | null
): string[] {
  const raw = attributes?.[GALLERY_IMAGES_ATTR];
  if (!raw) return [];
  if (Array.isArray(raw)) return uniqueImageUrls(raw.map(String));
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) return uniqueImageUrls(parsed.map(String));
  } catch {
    /* ignore */
  }
  return [];
}

/** Server API expects singular `image`; full gallery lives in attributes.galleryImages. */
export function listingToApiPayload(
  listing: Listing
): Omit<Listing, "images"> & { image: string } {
  const { images, ...rest } = listing;
  const gallery = uniqueImageUrls(images ?? []);
  const attributes =
    typeof rest.attributes === "object" && rest.attributes
      ? { ...rest.attributes }
      : {};
  // Persist AI twin activation inside attributes (DB stores attributes as jsonb).
  if (listing.isAiTwinActive === true) {
    attributes.isAiTwinActive = "true";
  }
  if (gallery.length) {
    attributes[GALLERY_IMAGES_ATTR] = galleryImagesAttributeValue(gallery);
  }
  return {
    ...rest,
    attributes,
    location: resolveListingCity(listing.location),
    image: gallery[0] ?? "",
    allowPastomatas: listing.allowPastomatas ?? true,
  };
}

export function listingPatchToApiPayload(
  patch: ListingEditPatch & Partial<Pick<Listing, "banned">>
): Record<string, unknown> {
  const { images, ...rest } = patch;
  const out: Record<string, unknown> = { ...rest };
  if (images !== undefined) {
    const gallery = uniqueImageUrls(images);
    out.image = gallery[0] ?? "";
    const attrs =
      out.attributes && typeof out.attributes === "object"
        ? (out.attributes as Record<string, unknown>)
        : {};
    out.attributes = {
      ...attrs,
      [GALLERY_IMAGES_ATTR]: galleryImagesAttributeValue(gallery),
    };
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
