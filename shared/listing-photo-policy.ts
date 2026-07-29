/**
 * Categories that may publish without public product photos (text-first ads),
 * plus per-category public gallery limits and Vision upload batching.
 */
import {
  normalizeListingCategoryId,
  type RegistryListingCategory,
} from "./category-registry";

const PHOTOLESS_CATEGORIES = new Set<RegistryListingCategory>([
  "jobs",
  "services",
  "real_estate",
]);

/** Physical-goods categories where packaging / label photo tips make sense. */
const PACKAGING_PHOTO_TIP_CATEGORIES = new Set<RegistryListingCategory>([
  "electronics",
  "vehicles",
  "transport",
  "tools",
  "home",
  "clothing",
]);

/** Default public gallery cap for most physical goods. */
export const DEFAULT_LISTING_PHOTO_LIMIT = 8;
/** Vehicles / transport — more angles (exterior, interior, docs separate). */
export const VEHICLE_LISTING_PHOTO_LIMIT = 12;
/** Real estate interiors / exteriors. */
export const REAL_ESTATE_LISTING_PHOTO_LIMIT = 12;
/**
 * Client Vision upload batch size — keeps Gemini / proxy under timeout when
 * sellers drop large photo baskets (wardrobe, auto parts, small appliances).
 */
export const VISION_UPLOAD_BATCH_SIZE = 6;
/** Absolute wire cap aligned with server VISION_MAX_IMAGES_PER_REQUEST. */
export const VISION_WIRE_MAX_IMAGES = 10;

export function listingPhotoLimitForCategory(category: unknown): number {
  const cat = normalizeListingCategoryId(category);
  if (cat === "vehicles" || cat === "transport") {
    return VEHICLE_LISTING_PHOTO_LIMIT;
  }
  if (cat === "real_estate") {
    return REAL_ESTATE_LISTING_PHOTO_LIMIT;
  }
  return DEFAULT_LISTING_PHOTO_LIMIT;
}

export function capListingGalleryUrls(
  urls: readonly string[],
  category?: unknown
): string[] {
  const limit = listingPhotoLimitForCategory(category);
  return urls.map((u) => String(u ?? "").trim()).filter(Boolean).slice(0, limit);
}

export function chunkForVisionUpload<T>(
  items: readonly T[],
  batchSize = VISION_UPLOAD_BATCH_SIZE
): T[][] {
  const size = Math.max(1, batchSize);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size) as T[]);
  }
  return out;
}

/** Short LT hint for chat / PrePublish copy. */
export function listingPhotoLimitHint(category?: unknown): string {
  return `iki ${listingPhotoLimitForCategory(category)} nuotraukų`;
}

/** Neutral cover used when publishing text-only jobs/services/NT ads. */
export const PHOTOLESS_LISTING_COVER_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="VAUTO">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f2744"/>
          <stop offset="100%" stop-color="#1a3d5c"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#g)"/>
      <text x="600" y="390" text-anchor="middle" fill="#f4f7fb" font-family="Georgia, serif" font-size="72" font-weight="700">VAUTO</text>
      <text x="600" y="460" text-anchor="middle" fill="#9db4c9" font-family="system-ui,sans-serif" font-size="28">Tekstinis skelbimas</text>
    </svg>`
  );

export function listingCategoryAllowsPhotoless(
  category: unknown
): boolean {
  return PHOTOLESS_CATEGORIES.has(normalizeListingCategoryId(category));
}

export function listingCategoryWantsPackagingPhotoTip(
  category: unknown
): boolean {
  const cat = normalizeListingCategoryId(category);
  if (PHOTOLESS_CATEGORIES.has(cat)) return false;
  return PACKAGING_PHOTO_TIP_CATEGORIES.has(cat);
}
