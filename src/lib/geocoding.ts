import { distanceKm, type UserCoords } from "@/lib/geolocation";
import { isPlaceholderCity } from "@/lib/city-resolve";
import {
  coordsForLtCity,
  detectCityInText,
  LT_CITY_COORDS,
} from "@/lib/lt-cities";

/** Soft label when city is unknown — never invent Vilnius/Kaunas. */
export const UNKNOWN_LISTING_LOCATION_LABEL = "Nežinoma lokacija";

/**
 * Country-only / nationwide / unknown labels — not a precise city.
 * Foreign IP users often land with "Lietuva" instead of a municipality.
 */
export function isCountryOnlyOrVagueLtLocation(
  locationText: string | undefined | null
): boolean {
  const raw = String(locationText ?? "").trim();
  if (!raw || isPlaceholderCity(raw)) return true;
  const n = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[.,;:!?'"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(nezinoma lokacija|nežinoma lokacija|unknown location|unknown)$/i.test(n)
  ) {
    return true;
  }
  if (
    /^(lietuva|lithuania|republic of lithuania|lietuvos respublika|lt|ltu|lt-lt)$/i.test(
      n
    )
  ) {
    return true;
  }
  if (
    /^(visa lietuva|visa lithuania|all lithuania|nationwide|visoje lietuvoje)$/i.test(
      n
    )
  ) {
    return true;
  }
  if (/^(lietuva|lithuania)(\s*,?\s*(eu|europe))?$/i.test(n)) return true;
  return false;
}

/** True when the location field should not be treated as a resolved city. */
export function isUnresolvedListingLocation(
  locationText: string | undefined | null
): boolean {
  return isCountryOnlyOrVagueLtLocation(locationText);
}

/**
 * Soft geocode — returns coords only for a known Lithuanian city.
 * Never invents a default town and never throws a blocking error.
 */
export function tryGeocodeLocation(
  locationText: string | undefined | null,
  uniqueSeed = ""
): UserCoords | null {
  const normalized = String(locationText ?? "").trim();
  if (!normalized || isUnresolvedListingLocation(normalized)) {
    return null;
  }

  const matchedCity = detectCityInText(normalized);
  const base = matchedCity
    ? LT_CITY_COORDS[matchedCity]
    : coordsForLtCity(normalized);
  if (!base) {
    console.warn("[geocode] unresolved location (no artificial fallback):", locationText);
    return null;
  }

  const neighborhoodJitter = hashJitter(
    `${uniqueSeed}|${normalized.replace(matchedCity ?? "", "").trim()}`
  );
  return {
    lat: roundCoord(base.lat + neighborhoodJitter.lat),
    lng: roundCoord(base.lng + neighborhoodJitter.lng),
  };
}

/**
 * @deprecated Prefer tryGeocodeLocation — kept for call sites that expect a soft result.
 * Returns null when unknown (never throws, never invents Vilnius).
 */
export function geocodeLocation(
  locationText: string,
  uniqueSeed = ""
): UserCoords | null {
  return tryGeocodeLocation(locationText, uniqueSeed);
}

function hashJitter(seed: string): { lat: number; lng: number } {
  if (!seed) return { lat: 0.008, lng: 0.004 };
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const lat = ((h % 100) / 10000) * (h % 2 === 0 ? 1 : -1);
  const lng = (((h >> 8) % 100) / 10000) * (h % 3 === 0 ? 1 : -1);
  return { lat, lng };
}

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function distanceToListing(
  buyer: UserCoords,
  listing: { latitude?: number; longitude?: number; location: string }
): number | null {
  if (listing.latitude != null && listing.longitude != null) {
    return (
      Math.round(
        distanceKm(buyer, { lat: listing.latitude, lng: listing.longitude }) * 10
      ) / 10
    );
  }
  return null;
}

export function enrichListingCoords<T extends { location: string; id?: string; latitude?: number; longitude?: number; attributes?: Record<string, unknown> }>(
  listing: T
): T & { latitude?: number; longitude?: number } {
  // Preserve explicit coords (e.g. GPS) already on the listing.
  if (listing.latitude != null && listing.longitude != null) {
    return listing;
  }

  const fromAttrs = coordsFromListingAttributes(listing.attributes);
  if (fromAttrs) {
    return { ...listing, latitude: fromAttrs.lat, longitude: fromAttrs.lng };
  }

  const loc = listing.location?.trim();
  if (!loc || isUnresolvedListingLocation(loc)) {
    return { ...listing };
  }

  const coords = tryGeocodeLocation(loc, listing.id ?? loc);
  if (!coords) {
    return { ...listing };
  }
  return {
    ...listing,
    latitude: coords.lat,
    longitude: coords.lng,
  };
}

/** Read soft-attached _geoLat/_geoLng from draft attributes. */
export function coordsFromListingAttributes(
  attributes: Record<string, unknown> | null | undefined
): UserCoords | null {
  if (!attributes) return null;
  const lat = Number(attributes._geoLat ?? attributes.geoLat);
  const lng = Number(attributes._geoLng ?? attributes.geoLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
