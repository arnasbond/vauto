import { distanceKm, type UserCoords } from "@/lib/geolocation";
import {
  LT_CITY_NAMES,
  coordsForLtCity,
  detectCityFuzzy,
} from "@/lib/lt-cities";
import type { ShippingProviderId } from "@/lib/shipping/shipping-provider";

export const NATIONAL_COVERAGE_LABEL = "Visa Lietuva";

export interface ParcelLocker {
  id: string;
  name: string;
  city: string;
  address: string;
  district?: string;
}

export interface ShippingRouteEstimate {
  originCity: string;
  destinationCity: string;
  distanceKm: number;
  transitDaysMin: number;
  transitDaysMax: number;
  providerId?: ShippingProviderId;
  summaryLt: string;
}

const PROVIDER_LABELS: Record<ShippingProviderId, string> = {
  omniva: "Omniva",
  lp_express: "LP Express",
  dpd: "DPD Pickup",
};

const NORM = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();

function slugifyCity(city: string): string {
  return NORM(city).replace(/\s+/g, "-");
}

/** Visos Lietuvos paštomatų bazė — be numatytų regioninių filtrų. */
function buildNationalLockers(providerId: ShippingProviderId): ParcelLocker[] {
  const label = PROVIDER_LABELS[providerId];
  return LT_CITY_NAMES.map((city) => ({
    id: `${providerId}-${slugifyCity(city)}-centre`,
    name: `${label} — ${city}`,
    city,
    address: `${city}, centrinis paštomatas`,
    district: city,
  }));
}

const NATIONAL_LOCKERS: Record<ShippingProviderId, ParcelLocker[]> = {
  omniva: buildNationalLockers("omniva"),
  lp_express: buildNationalLockers("lp_express"),
  dpd: buildNationalLockers("dpd"),
};

export function resolveShippingCity(locationText: string): string | undefined {
  const trimmed = locationText.trim();
  if (!trimmed || NORM(trimmed) === "lietuva") return undefined;
  return detectCityFuzzy(trimmed) ?? detectCityFuzzy(trimmed.split(",")[0] ?? "");
}

export function searchParcelLockers(opts: {
  providerId: ShippingProviderId;
  query?: string;
  city?: string;
  nearCoords?: UserCoords;
  limit?: number;
}): ParcelLocker[] {
  const limit = opts.limit ?? 120;
  let lockers = NATIONAL_LOCKERS[opts.providerId] ?? NATIONAL_LOCKERS.omniva;

  const cityFilter = opts.city?.trim()
    ? resolveShippingCity(opts.city) ?? opts.city.trim()
    : undefined;
  const query = opts.query?.trim();

  if (cityFilter) {
    const normCity = NORM(cityFilter);
    lockers = lockers.filter(
      (l) =>
        NORM(l.city) === normCity ||
        NORM(l.city).includes(normCity) ||
        normCity.includes(NORM(l.city))
    );
  }

  if (query) {
    const normQ = NORM(query);
    lockers = lockers.filter((l) => {
      const hay = `${l.name} ${l.city} ${l.address} ${l.district ?? ""}`;
      return NORM(hay).includes(normQ);
    });
  }

  if (opts.nearCoords) {
    lockers = [...lockers].sort((a, b) => {
      const ca = coordsForLtCity(a.city);
      const cb = coordsForLtCity(b.city);
      if (!ca || !cb) return a.city.localeCompare(b.city, "lt");
      return (
        distanceKm(opts.nearCoords!, ca) - distanceKm(opts.nearCoords!, cb)
      );
    });
  } else {
    lockers = [...lockers].sort((a, b) =>
      a.city.localeCompare(b.city, "lt")
    );
  }

  return lockers.slice(0, limit);
}

export function lockersForProvider(providerId: ShippingProviderId): ParcelLocker[] {
  return searchParcelLockers({ providerId, limit: 60 });
}

function cityCoords(city: string): UserCoords | null {
  return coordsForLtCity(city);
}

function transitDaysFromDistance(km: number): {
  min: number;
  max: number;
} {
  if (km <= 5) return { min: 1, max: 1 };
  if (km <= 80) return { min: 1, max: 2 };
  if (km <= 180) return { min: 2, max: 3 };
  if (km <= 320) return { min: 2, max: 4 };
  return { min: 3, max: 5 };
}

/** Nacionalinis maršruto ETA skaičiavimas tarp bet kurių LT miestų / rajonų. */
export function estimateNationalShippingRoute(
  originLocation: string,
  destinationLocation: string,
  providerId?: ShippingProviderId
): ShippingRouteEstimate | null {
  const originCity =
    resolveShippingCity(originLocation) ??
    resolveShippingCity(originLocation.split(",")[0] ?? "");
  const destinationCity =
    resolveShippingCity(destinationLocation) ??
    resolveShippingCity(destinationLocation.split(",")[0] ?? "");

  if (!originCity || !destinationCity) return null;

  const origin = cityCoords(originCity);
  const destination = cityCoords(destinationCity);
  if (!origin || !destination) return null;

  const km = Math.round(distanceKm(origin, destination) * 10) / 10;
  const { min, max } = transitDaysFromDistance(km);
  const provider = providerId ? PROVIDER_LABELS[providerId] : "kurjeris";

  let summaryLt: string;
  if (originCity === destinationCity) {
    summaryLt = `Siunta ${originCity} → ${destinationCity}: dažniausiai ${min} darbo d. (${provider}, ${NATIONAL_COVERAGE_LABEL}).`;
  } else if (min === max) {
    summaryLt = `Siunta ${originCity} → ${destinationCity} (~${km} km): apie ${min} darbo d. per ${provider} visoje Lietuvoje.`;
  } else {
    summaryLt = `Siunta ${originCity} → ${destinationCity} (~${km} km): ${min}–${max} darbo d. per ${provider} (${NATIONAL_COVERAGE_LABEL}).`;
  }

  return {
    originCity,
    destinationCity,
    distanceKm: km,
    transitDaysMin: min,
    transitDaysMax: max,
    providerId,
    summaryLt,
  };
}

export function formatShippingRouteMessage(
  estimate: ShippingRouteEstimate
): string {
  return estimate.summaryLt;
}

export function listNationalCities(): string[] {
  return [...LT_CITY_NAMES];
}
