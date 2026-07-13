import { distanceKm, getUserCoords, type UserCoords } from "@/lib/geolocation";
import {
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
 * Resolve listing city for publish: explicit draft → verified profile → geo hint.
 * Never invents Vilnius or other defaults.
 */
export function resolvePublishListingCity(
  draftLocation: string | undefined | null,
  profileCity: string | undefined | null,
  geoCoords?: UserCoords | null
): string {
  const fromDraft = normalizeKnownListingCity(draftLocation);
  if (fromDraft) return fromDraft;

  const fromProfile = verifiedProfileCity(profileCity);
  if (fromProfile) return fromProfile;

  if (geoCoords) {
    const fromGeo = nearestLtCityFromCoords(geoCoords);
    if (fromGeo) return fromGeo;
  }

  return "";
}

/** Dynamic hint for AI extraction — profile first, then optional browser geolocation. */
export async function resolveDynamicListingLocation(opts: {
  profileCity?: string | null;
  requestGeo?: boolean;
}): Promise<string> {
  const fromProfile = verifiedProfileCity(opts.profileCity);
  if (fromProfile) return fromProfile;

  if (opts.requestGeo === false) return "";

  const coords = await getUserCoords({ requestPermission: true });
  if (!coords) return "";

  return nearestLtCityFromCoords(coords);
}
