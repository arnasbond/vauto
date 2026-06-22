import { Capacitor } from "@capacitor/core";

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
const CITY_COORDS: Record<string, UserCoords> = {
  Vilnius: { lat: 54.6872, lng: 25.2797 },
  Kaunas: { lat: 54.8985, lng: 23.9036 },
  "Panevėžys": { lat: 55.7348, lng: 24.3575 },
  Klaipėda: { lat: 55.7033, lng: 21.1443 },
  "Šiauliai": { lat: 55.9349, lng: 23.3137 },
  Alytus: { lat: 54.3963, lng: 24.0458 },
  Marijampolė: { lat: 54.5599, lng: 23.3541 },
  Mažeikiai: { lat: 56.3089, lng: 22.3414 },
  Jonava: { lat: 55.0725, lng: 24.2797 },
  Utena: { lat: 55.4974, lng: 25.5997 },
  Telšiai: { lat: 55.9814, lng: 22.2472 },
  Tauragė: { lat: 55.2522, lng: 22.2897 },
  Ukmergė: { lat: 55.2453, lng: 24.7761 },
  Plungė: { lat: 55.9114, lng: 21.8442 },
  Kėdainiai: { lat: 55.2881, lng: 23.9747 },
  Raseiniai: { lat: 55.3797, lng: 23.1239 },
  Druskininkai: { lat: 54.0167, lng: 23.9667 },
  Palanga: { lat: 55.9175, lng: 21.0689 },
  Biržai: { lat: 56.2006, lng: 24.7561 },
};

export function coordsForCity(city: string): UserCoords | null {
  const key = Object.keys(CITY_COORDS).find(
    (k) => k.toLowerCase() === city.toLowerCase()
  );
  return key ? CITY_COORDS[key] : null;
}

export function distanceToCity(
  user: UserCoords,
  city: string
): number | null {
  const cityCoords = coordsForCity(city);
  if (!cityCoords) return null;
  return distanceKm(user, cityCoords);
}
