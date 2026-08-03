import { distanceKm, getUserCoords, isCoordsInLithuania, type UserCoords } from "@/lib/geolocation";
import {
  DEFAULT_LISTING_GEO_CITY,
  isCountryOnlyOrVagueLtLocation,
} from "@/lib/geocoding";
import {
  coordsForLtCity,
  LT_CITY_COORDS,
  LT_CITY_NAMES,
} from "@/lib/lt-cities";
import { isPlaceholderCity, normalizeKnownListingCity } from "@/lib/city-resolve";

/** Agent prompt when listing city is unknown — mirrors unverified price handling. */
export const LOCATION_MISSING_AGENT_PROMPT =
  "Matau, kad vieta nenurodyta — patikslinkite miestą Lietuvoje (pvz. Vilnius, Kaunas) arba palikite nenurodytą.";

const MAX_GEO_CITY_DISTANCE_KM = 45;

/** Explicit draft city: known LT name, or any non-placeholder free-text the user typed. */
function explicitDraftCity(draftLocation: string | undefined | null): string {
  const known = normalizeKnownListingCity(draftLocation);
  if (known) return known;
  const raw = String(draftLocation ?? "").trim();
  if (!raw || isPlaceholderCity(raw)) return "";
  // Country-only ("Lietuva") is not a publishable city — soft-fallback to Vilnius.
  if (isCountryOnlyOrVagueLtLocation(raw)) return DEFAULT_LISTING_GEO_CITY;
  return raw;
}

/** Profile city only when it maps to a known Lithuanian city. */
export function verifiedProfileCity(profileCity?: string | null): string {
  return normalizeKnownListingCity(profileCity);
}

/**
 * Effective city for AI / publish context.
 * Never force a stale LT profile city (e.g. Kaišiadorys) when GPS is abroad or missing.
 */
export function resolveEffectiveUserCity(opts: {
  profileCity?: string | null;
  geoCoords?: UserCoords | null;
}): string {
  const fromProfile = verifiedProfileCity(opts.profileCity);
  const coords = opts.geoCoords ?? null;

  if (coords) {
    if (!isCoordsInLithuania(coords)) return "";
    const fromGeo = nearestLtCityFromCoords(coords);
    if (fromGeo) return fromGeo;
    return "";
  }

  return fromProfile;
}

/** Nearest known LT city from GPS — only when within a tight radius (no wild guesses). */
export function nearestLtCityFromCoords(coords: UserCoords): string {
  if (!isCoordsInLithuania(coords)) return "";

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
  if (db + 2 < da) return b;
  return a;
}

/**
 * Resolve listing city for publish: explicit draft → GPS municipality → profile.
 * Never invents a default town. Abroad GPS → only explicit draft city (or empty).
 * Free-text draft (incl. foreign cities) is preserved when the user typed it.
 *
 * HARD: any non-empty draft/location the seller set (AI or manual) wins over GPS.
 * Background geo must never overwrite a value already on the draft card.
 */
export function resolvePublishListingCity(
  draftLocation: string | undefined | null,
  profileCity: string | undefined | null,
  geoCoords?: UserCoords | null
): string {
  const fromDraft = explicitDraftCity(draftLocation);
  // Seller / AI draft city is highest priority — never snap back to GPS.
  if (fromDraft) return fromDraft;

  const fromProfile = verifiedProfileCity(profileCity);
  const abroad = Boolean(geoCoords && !isCoordsInLithuania(geoCoords));
  if (abroad) return "";

  const fromGeo =
    geoCoords && !abroad ? nearestLtCityFromCoords(geoCoords) : "";

  if (geoCoords && fromGeo) {
    if (fromProfile) {
      return preferLocalCityNearCoords(fromGeo, fromProfile, geoCoords);
    }
    return fromGeo;
  }

  if (fromProfile) return fromProfile;
  return "";
}

/**
 * Dynamic hint for AI extraction — GPS municipality first, then profile.
 * Abroad / unknown GPS → empty (never invent Kaišiadorys).
 */
export async function resolveDynamicListingLocation(opts: {
  profileCity?: string | null;
  requestGeo?: boolean;
}): Promise<string> {
  const fromProfile = verifiedProfileCity(opts.profileCity);

  if (opts.requestGeo === false) return fromProfile;

  const coords = await getUserCoords({ requestPermission: true });
  if (!coords) return fromProfile;
  if (!isCoordsInLithuania(coords)) return "";

  const fromGeo = nearestLtCityFromCoords(coords);
  if (!fromGeo) return "";

  if (!fromProfile) return fromGeo;
  return preferLocalCityNearCoords(fromGeo, fromProfile, coords);
}
