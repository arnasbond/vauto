import { isPlaceholderCity } from "@/lib/city-resolve";
import { distanceToListing } from "@/lib/geocoding";
import {
  distanceToCity,
  isDisplayableDistanceKm,
  isMarketplaceBuyerLocal,
  type UserCoords,
} from "@/lib/geolocation";
import type { Listing } from "@/lib/types";

export const LISTING_LOCATION_UNSET_LABEL = "Nenurodyta";

/** Display city or neutral label — never invent a fallback town. */
export function formatListingLocationLabel(
  location: string | undefined | null
): string {
  const raw = String(location ?? "").trim();
  if (!raw || isPlaceholderCity(raw)) return LISTING_LOCATION_UNSET_LABEL;
  return raw;
}

/**
 * Recalculate listing distances from buyer GPS.
 * - No buyer / buyer outside LT → strip distances (no Kaišiadorys default, no NL→LT km).
 * - Distance only when listing has coords or a known LT city, and result is local-scale.
 */
export function applyBuyerDistances(
  items: Listing[],
  buyer: UserCoords | null
): Listing[] {
  if (!isMarketplaceBuyerLocal(buyer)) {
    return items.map((l) =>
      l.distanceKm === undefined ? l : { ...l, distanceKm: undefined }
    );
  }

  const localBuyer = buyer!;

  return items.map((l) => {
    const exact = distanceToListing(localBuyer, l);
    const fallback = distanceToCity(localBuyer, l.location);
    const km = exact ?? fallback;
    if (!isDisplayableDistanceKm(km)) {
      return l.distanceKm === undefined ? l : { ...l, distanceKm: undefined };
    }
    return { ...l, distanceKm: km! };
  });
}
