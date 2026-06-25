import { distanceKm, type UserCoords } from "@/lib/geolocation";
import {
  coordsForLtCity,
  detectCityInText,
  LT_CITY_COORDS,
} from "@/lib/lt-cities";

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
    base = direct ?? { lat: 55.1694, lng: 23.8813 };
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
): T & { latitude: number; longitude: number } {
  const coords = geocodeLocation(
    listing.location,
    listing.id ?? listing.location
  );
  return { ...listing, latitude: coords.lat, longitude: coords.lng };
}
