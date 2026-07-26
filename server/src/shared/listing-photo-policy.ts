/**
 * Categories that may publish without public product photos (text-first ads).
 */
import {
  normalizeListingCategoryId,
  type RegistryListingCategory,
} from "./category-registry.js";

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
