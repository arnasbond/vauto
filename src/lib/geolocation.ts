import { Capacitor } from "@capacitor/core";

import {
  coordsForLtCity,
} from "@/lib/lt-cities";

export interface UserCoords {
  lat: number;
  lng: number;
}

/** Get device GPS coordinates — Capacitor on native, geolocation API on web */
export async function getUserCoords(): Promise<UserCoords | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        await Geolocation.requestPermissions();
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
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
