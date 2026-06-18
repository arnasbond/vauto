import {
  coordsForCity,
  distanceKm,
  type UserCoords,
} from "@/lib/geolocation";

/** Mock geocoding — resolves Lithuanian city/neighborhood text to coordinates */
export function geocodeLocation(locationText: string): UserCoords {
  const normalized = locationText.trim();
  const lower = normalized.toLowerCase();

  const cities = [
    "Vilnius",
    "Kaunas",
    "Panevėžys",
    "Klaipėda",
    "Šiauliai",
    "Alytus",
    "Marijampolė",
    "Mažeikiai",
    "Jonava",
    "Utena",
  ];

  let base: UserCoords | null = null;
  let matchedCity = "";

  for (const city of cities) {
    if (lower.includes(city.toLowerCase())) {
      base = coordsForCity(city);
      matchedCity = city;
      break;
    }
  }

  if (!base) {
    base = coordsForCity("Panevėžys") ?? { lat: 55.7348, lng: 24.3575 };
    matchedCity = "Panevėžys";
  }

  const neighborhoodJitter = hashJitter(normalized.replace(matchedCity, "").trim());
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
    return Math.round(distanceKm(buyer, { lat: listing.latitude, lng: listing.longitude }) * 10) / 10;
  }
  return null;
}

export function enrichListingCoords<T extends { location: string }>(
  listing: T
): T & { latitude: number; longitude: number } {
  const coords = geocodeLocation(listing.location);
  return { ...listing, latitude: coords.lat, longitude: coords.lng };
}
