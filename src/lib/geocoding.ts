import { distanceKm, type UserCoords } from "@/lib/geolocation";
import { isPlaceholderCity } from "@/lib/city-resolve";
import {
  coordsForLtCity,
  detectCityInText,
  LT_CITY_COORDS,
} from "@/lib/lt-cities";

/** Soft-launch default when geocode gets only a country / unknown place. */
export const DEFAULT_LISTING_GEO_CITY = "Vilnius";

const DEFAULT_LISTING_COORDS: UserCoords = LT_CITY_COORDS[DEFAULT_LISTING_GEO_CITY]!;

/**
 * Country-only / nationwide labels that must never hard-fail publish.
 * Foreign IP users often land with "Lietuva" instead of a city.
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
    /^(lietuva|lithuania|republic of lithuania|lietuvos Respublika|lt|ltu|lt-lt)$/i.test(
      n
    )
  ) {
    return true;
  }
  if (/^(visa lietuva|visa lithuania|all lithuania|nationwide|visoje lietuvoje)$/i.test(n)) {
    return true;
  }
  // "Lietuva" / "Lithuania" alone with optional country suffix noise
  if (/^(lietuva|lithuania)(\s*,?\s*(eu|europe))?$/i.test(n)) return true;
  return false;
}

/**
 * City label safe for publish + geocode. Country-only / unknown → Vilnius.
 * Never invents a city for buyer search — only listing publish soft-fallback.
 */
export function resolveGeocodeableListingCity(
  locationText: string | undefined | null
): string {
  const raw = String(locationText ?? "").trim();
  if (!raw || isPlaceholderCity(raw) || isCountryOnlyOrVagueLtLocation(raw)) {
    return DEFAULT_LISTING_GEO_CITY;
  }
  const matchedCity = detectCityInText(raw);
  if (matchedCity) return matchedCity;
  if (coordsForLtCity(raw)) {
    return raw;
  }
  // Unknown free-text (incl. foreign city) — still publishable with Vilnius pin.
  return DEFAULT_LISTING_GEO_CITY;
}

/** Mock geocoding — resolves Lithuanian city/neighborhood text to coordinates */
export function geocodeLocation(
  locationText: string,
  uniqueSeed = ""
): UserCoords {
  const normalized = locationText.trim();
  const matchedCity = detectCityInText(normalized);

  let base: UserCoords;
  if (matchedCity) {
    base = LT_CITY_COORDS[matchedCity]!;
  } else {
    const direct = coordsForLtCity(normalized);
    if (direct) {
      base = direct;
    } else {
      // Soft fallback — never throw a blocking red error for Lietuva / abroad / unknown.
      console.warn(
        `[geocode] unknown/country-only location → ${DEFAULT_LISTING_GEO_CITY}:`,
        locationText
      );
      base = DEFAULT_LISTING_COORDS;
    }
  }

  const neighborhoodJitter = hashJitter(
    `${uniqueSeed}|${normalized.replace(matchedCity ?? "", "").trim()}`
  );
  return {
    lat: roundCoord(base.lat + neighborhoodJitter.lat),
    lng: roundCoord(base.lng + neighborhoodJitter.lng),
  };
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

export function enrichListingCoords<T extends { location: string; id?: string }>(
  listing: T
): T & { latitude?: number; longitude?: number } {
  const loc = listing.location?.trim();
  if (!loc || isPlaceholderCity(loc)) {
    return { ...listing };
  }
  const coords = geocodeLocation(loc, listing.id ?? loc);
  const nextLocation = isCountryOnlyOrVagueLtLocation(loc)
    ? DEFAULT_LISTING_GEO_CITY
    : listing.location;
  return {
    ...listing,
    location: nextLocation,
    latitude: coords.lat,
    longitude: coords.lng,
  };
}
