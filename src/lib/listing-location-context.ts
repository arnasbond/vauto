import { distanceKm, getUserCoords, type UserCoords } from "@/lib/geolocation";
import {
  coordsForLtCity,
  LT_CITY_COORDS,
  LT_CITY_NAMES,
} from "@/lib/lt-cities";
import { normalizeKnownListingCity } from "@/lib/city-resolve";

/** Agent prompt when listing city is unknown — mirrors unverified price handling. */
export const LOCATION_MISSING_AGENT_PROMPT =
  "Matau, kad vieta nenurodyta — patikslinkite savo miestą (pvz. Kaišiadorys, Kaunas), kad skelbimas būtų matomas teisingame regione.";

const MAX_GEO_CITY_DISTANCE_KM = 45;

/** Profile city only when it maps to a known Lithuanian city. */
export function verifiedProfileCity(profileCity?: string | null): string {
  return normalizeKnownListingCity(profileCity);
}

/** Nearest known LT city from GPS — only when within a tight radius (no wild guesses). */
export function nearestLtCityFromCoords(coords: UserCoords): string {
  let best: { city: string; d: number } | null = null;
  for (const city of LT_CITY_NAMES) {
    const center = LT_CITY_COORDS[city]!;
    const d = distanceKm(coords, center);
    if (!best || d < best.d) best = { city, d };
  }
  if (!best || best.d > MAX_GEO_CITY_DISTANCE_KM) return "";
  return best.city;
}

/**
 * Prefer the locality closer to GPS when draft/profile picked a regional hub
 * (e.g. Kaunas) while the device is in a municipality town (Kaišiadorys).
 */
export function preferLocalCityNearCoords(
  primary: string,
  secondary: string,
  coords: UserCoords
): string {
  const a = normalizeKnownListingCity(primary);
  const b = normalizeKnownListingCity(secondary);
  if (a && !b) return a;
  if (b && !a) return b;
  if (!a && !b) return "";
  if (a === b) return a;

  const ca = coordsForLtCity(a);
  const cb = coordsForLtCity(b);
  if (!ca || !cb) return a || b;

  const da = distanceKm(coords, ca);
  const db = distanceKm(coords, cb);
  // Prefer clearly closer municipality (2 km slack for GPS noise).
  if (db + 2 < da) return b;
  return a;
}

/**
 * Resolve listing city for publish: explicit draft → GPS municipality → profile.
 * Never invents Vilnius/Kaunas hubs when GPS points at a closer town.
 */
export function resolvePublishListingCity(
  draftLocation: string | undefined | null,
  profileCity: string | undefined | null,
  geoCoords?: UserCoords | null
): string {
  const fromDraft = normalizeKnownListingCity(draftLocation);
  const fromProfile = verifiedProfileCity(profileCity);
  const fromGeo = geoCoords ? nearestLtCityFromCoords(geoCoords) : "";

  if (geoCoords && fromGeo) {
    if (fromDraft) {
      return preferLocalCityNearCoords(fromDraft, fromGeo, geoCoords);
    }
    if (fromProfile) {
      return preferLocalCityNearCoords(fromGeo, fromProfile, geoCoords);
    }
    return fromGeo;
  }

  if (fromDraft) return fromDraft;
  if (fromProfile) return fromProfile;
  return "";
}

/**
 * Dynamic hint for AI extraction — GPS municipality first, then profile.
 * Fixes regional-hub bias (Kaišiadorys must not become Kaunas · 36 km).
 */
export async function resolveDynamicListingLocation(opts: {
  profileCity?: string | null;
  requestGeo?: boolean;
}): Promise<string> {
  const fromProfile = verifiedProfileCity(opts.profileCity);

  if (opts.requestGeo === false) return fromProfile;

  const coords = await getUserCoords({ requestPermission: true });
  if (!coords) return fromProfile;

  const fromGeo = nearestLtCityFromCoords(coords);
  if (!fromGeo) return fromProfile;

  if (!fromProfile) return fromGeo;
  return preferLocalCityNearCoords(fromGeo, fromProfile, coords);
}
