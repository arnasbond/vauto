import type { LegacyListingInput, Listing } from "@/lib/types";
import { getSafeImageUrl } from "@/lib/utils";
import { hardFilterPublicGalleryUrls } from "@/lib/listing-gallery-roles";
import { capListingGalleryUrls } from "@vauto/shared/listing-photo-policy";

/**
 * Neutral system placeholder only — never Unsplash / stock / category photos.
 * Prefer Cloudinary CDN (stable for Next/Image); SVG is same-origin fallback.
 */
export const LISTING_PLACEHOLDER_IMAGE =
  "https://res.cloudinary.com/dhbrljo8v/image/upload/v1785776907/vauto/system/listing-placeholder.png";

export const LISTING_PLACEHOLDER_SVG = "/listing-placeholder.svg";

export function isValidListingImageUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:image/")) return true;
  if (trimmed.startsWith("blob:")) return true;
  return /^https?:\/\/.+/i.test(trimmed);
}

/** Stock Unsplash / picsum demos — never attach to real seller publishes or covers. */
export function isDemoStockImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  return (
    u.includes("images.unsplash.com/") ||
    u.includes("unsplash.com/") ||
    u.includes("picsum.photos") ||
    u.includes("loremflickr") ||
    u.includes("placehold.co") ||
    u.includes("via.placeholder")
  );
}

export function isListingPlaceholderUrl(url: string): boolean {
  return /listing-placeholder/i.test(url.trim());
}

/** Keep only real session/seller uploads (drop stock Unsplash fillers + document evidence). */
export function filterSessionListingImages(
  urls: readonly string[] | undefined,
  opts?: {
    documentUrls?: readonly string[];
    attributes?: Record<string, string | string[] | undefined>;
  }
): string[] {
  return hardFilterPublicGalleryUrls(
    uniqueUrls(
      (urls ?? []).filter(
        (url) => isValidListingImageUrl(url) && !isDemoStockImageUrl(url)
      )
    ),
    opts?.documentUrls,
    opts?.attributes
  );
}

type ListingImageFields = Pick<
  Listing,
  "title" | "category" | "description" | "images"
> & {
  image?: string;
  attributes?: Record<string, string | string[] | undefined>;
};

/** Prefer http(s) covers; treat empty / stripped data: blobs as missing for feed cards. */
function usableCoverUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return null;
  if (isDemoStockImageUrl(trimmed)) return null;
  if (!isValidListingImageUrl(trimmed)) return null;
  return trimmed;
}

function attrUrlList(
  attributes: ListingImageFields["attributes"] | undefined,
  key: string
): string[] {
  const raw = attributes?.[key];
  if (Array.isArray(raw)) {
    return raw.filter((u): u is string => typeof u === "string" && Boolean(u.trim()));
  }
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

/** Build ordered gallery candidates: images[] → gallery attrs → singular image. */
export function collectListingGalleryCandidates(
  listing: ListingImageFields
): string[] {
  const fromImages = listing.images ?? [];
  const fromAttrs = [
    ...attrUrlList(listing.attributes, "galleryUrls"),
    ...attrUrlList(listing.attributes, "orderedImageUrls"),
    ...attrUrlList(listing.attributes, "imageUrls"),
    ...attrUrlList(listing.attributes, "photoUrls"),
  ];
  const fromCover = listing.image ? [listing.image] : [];
  return uniqueUrls([...fromImages, ...fromAttrs, ...fromCover]);
}

/**
 * Cover = first real user upload (images[0] / gallery), else neutral placeholder.
 * Never invents Unsplash / category stock photos.
 */
export function resolveListingImage(listing: ListingImageFields): string {
  const gallery = filterSessionListingImages(
    collectListingGalleryCandidates(listing),
    { attributes: listing.attributes }
  );
  const httpFirst = gallery.map(usableCoverUrl).find(Boolean);
  if (httpFirst) return httpFirst;

  // Draft / in-memory may still have data: as images[0] — allow for previews only.
  const dataFirst = gallery.find(
    (u) => typeof u === "string" && u.trim().startsWith("data:image/")
  );
  if (dataFirst) return dataFirst.trim();

  return LISTING_PLACEHOLDER_IMAGE;
}

function imageDedupeKey(url: string): string {
  const u = url.trim();
  if (u.startsWith("data:")) {
    const comma = u.indexOf(",");
    const meta = comma >= 0 ? u.slice(0, comma) : "data";
    const payload = comma >= 0 ? u.slice(comma + 1) : u;
    const len = payload.length;
    const sample =
      payload.slice(0, 48) + payload.slice(Math.max(0, len - 48));
    return `data:${meta.length}:${len}:${sample}`;
  }
  try {
    const parsed = new URL(u);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return u;
  }
}

function uniqueUrls(urls: string[]): string[] {
  const map = new Map<string, string>();
  for (const url of urls) {
    const trimmed = url.trim();
    if (!isValidListingImageUrl(trimmed)) continue;
    const key = imageDedupeKey(trimmed);
    if (!map.has(key)) map.set(key, trimmed);
  }
  return Array.from(map.values());
}

/** Public helper — Map-based URL/fingerprint dedupe for draft / PrePublish galleries. */
export function dedupeListingImageUrls(
  urls: readonly string[] | undefined,
  max = 6
): string[] {
  return uniqueUrls([...(urls ?? [])]).slice(0, max);
}

/**
 * Full gallery for detail swipe.
 * Real seller photos only — never padded with Unsplash stock.
 */
export function resolveListingImages(listing: ListingImageFields): string[] {
  const fromListing = filterSessionListingImages(
    collectListingGalleryCandidates(listing),
    { attributes: listing.attributes }
  );
  if (fromListing.length > 0) {
    return capListingGalleryUrls(fromListing, listing.category);
  }
  return [LISTING_PLACEHOLDER_IMAGE];
}

export function getListingCoverImage(listing: ListingImageFields): string {
  return getSafeImageUrl(resolveListingImage(listing));
}

export function getListingGalleryImages(listing: ListingImageFields): string[] {
  return resolveListingImages(listing).map(getSafeImageUrl);
}

export function coalesceListingImages(
  incoming: string[] | undefined,
  fallback: string[] | undefined,
  listing: Pick<Listing, "title" | "category" | "description"> & {
    attributes?: ListingImageFields["attributes"];
  }
): string[] {
  const inc = filterSessionListingImages(incoming, {
    attributes: listing.attributes,
  });
  if (inc.length) return inc;
  const fb = filterSessionListingImages(fallback, {
    attributes: listing.attributes,
  });
  if (fb.length) return fb;
  return [];
}

export function listingImagesFromLegacy(raw: LegacyListingInput): string[] {
  const attrs = (raw as Listing).attributes;
  return filterSessionListingImages(
    collectListingGalleryCandidates({
      title: raw.title,
      category: raw.category,
      description: raw.description,
      images: raw.images,
      image: raw.image,
      attributes: attrs,
    }),
    { attributes: attrs }
  );
}

export function coalesceListingImage(
  incoming: string | undefined,
  fallback: string | undefined,
  listing: Pick<Listing, "title" | "category" | "description"> & {
    attributes?: ListingImageFields["attributes"];
  }
): string {
  if (isValidListingImageUrl(incoming) && !isDemoStockImageUrl(incoming)) {
    return incoming.trim();
  }
  if (isValidListingImageUrl(fallback) && !isDemoStockImageUrl(fallback)) {
    return fallback.trim();
  }
  return resolveListingImage({ ...listing, images: [] });
}
