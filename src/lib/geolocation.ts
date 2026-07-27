import { Capacitor } from "@capacitor/core";

import {
  coordsForLtCity,
} from "@/lib/lt-cities";

export interface UserCoords {
  lat: number;
  lng: number;
}

/** Approximate Lithuania bounding box — visitors outside get no LT city / distance. */
const LT_BOUNDS = {
  minLat: 53.85,
  maxLat: 56.55,
  minLng: 20.85,
  maxLng: 26.95,
} as const;

/** Marketplace distances beyond this are noise (e.g. NL → Kaišiadorys). */
export const MAX_MARKETPLACE_DISTANCE_KM = 280;

export function isCoordsInLithuania(coords: UserCoords): boolean {
  return (
    coords.lat >= LT_BOUNDS.minLat &&
    coords.lat <= LT_BOUNDS.maxLat &&
    coords.lng >= LT_BOUNDS.minLng &&
    coords.lng <= LT_BOUNDS.maxLng
  );
}

/** True when buyer GPS is present and inside Lithuania. */
export function isMarketplaceBuyerLocal(buyer: UserCoords | null | undefined): boolean {
  return Boolean(buyer && isCoordsInLithuania(buyer));
}

/** Get device GPS coordinates — Capacitor on native, geolocation API on web */
export async function getUserCoords(options?: {
  /** Native only: prompt for location if not yet granted (avoid on cold start). */
  requestPermission?: boolean;
}): Promise<UserCoords | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        if (!options?.requestPermission) return null;
        const req = await Geolocation.requestPermissions();
        if (req.location !== "granted") return null;
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 15000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) =>
            resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { timeout: 10000 }
        );
      });
    }
  } catch {
    return null;
  }
  return null;
}

/** Haversine distance in km between two coordinates */
export function distanceKm(
  a: UserCoords,
  b: UserCoords
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Approximate Lithuanian city centers for distance recalculation */
export function coordsForCity(city: string): UserCoords | null {
  return coordsForLtCity(city);
}

export function distanceToCity(
  user: UserCoords,
  city: string
): number | null {
  const cityCoords = coordsForCity(city);
  if (!cityCoords) return null;
  return distanceKm(user, cityCoords);
}

/** Whether a computed km value may be shown in UI. */
export function isDisplayableDistanceKm(km: number | null | undefined): boolean {
  return (
    typeof km === "number" &&
    Number.isFinite(km) &&
    km >= 0 &&
    km <= MAX_MARKETPLACE_DISTANCE_KM
  );
}
