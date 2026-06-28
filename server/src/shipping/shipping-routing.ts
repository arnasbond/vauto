import { distanceKm, type UserCoords } from "./geo-utils.js";

export const NATIONAL_COVERAGE_LABEL = "Visa Lietuva";

export type ShippingProviderId = "omniva" | "lp_express" | "dpd";

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

/** Lietuvos miestų ir rajonų centrai — nacionalinis georouting be regioninių filtrų. */
export const LT_CITY_COORDS: Record<string, UserCoords> = {
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
  Pasvalys: { lat: 56.0603, lng: 24.4036 },
  Rokiškis: { lat: 55.9587, lng: 25.5947 },
  Kupiškis: { lat: 55.8425, lng: 24.9872 },
  Kretinga: { lat: 55.8884, lng: 21.2445 },
  Gargždai: { lat: 55.7094, lng: 21.3944 },
  Visaginas: { lat: 55.5982, lng: 26.4318 },
  Neringa: { lat: 55.3714, lng: 21.0627 },
  Šalčininkai: { lat: 54.3092, lng: 25.3874 },
  Varėna: { lat: 54.2122, lng: 24.5674 },
  Lazdijai: { lat: 54.2344, lng: 23.5156 },
  Prienai: { lat: 54.6333, lng: 23.9417 },
  Kaišiadorys: { lat: 54.8667, lng: 24.45 },
  Elektrėnai: { lat: 54.785, lng: 24.6631 },
  Molėtai: { lat: 55.2269, lng: 25.4186 },
  Ignalina: { lat: 55.3406, lng: 26.1606 },
  Zarasai: { lat: 55.7306, lng: 26.2469 },
  "Širvintos": { lat: 55.0442, lng: 24.9575 },
  Anykščiai: { lat: 55.5256, lng: 25.1025 },
  Pakruojis: { lat: 55.9789, lng: 23.8556 },
  Radviliškis: { lat: 55.8106, lng: 23.5464 },
  Kelmė: { lat: 55.6306, lng: 22.9319 },
  Jurbarkas: { lat: 55.0778, lng: 22.7667 },
  "Šilutė": { lat: 55.3489, lng: 21.4831 },
  Pagėgiai: { lat: 55.1389, lng: 21.9083 },
  "Šakiai": { lat: 54.9539, lng: 23.0486 },
  Vilkaviškis: { lat: 54.6517, lng: 23.0356 },
  Kalvarija: { lat: 54.4167, lng: 23.2167 },
  "Kazlų Rūda": { lat: 54.7492, lng: 23.4903 },
  Birštonas: { lat: 54.6031, lng: 24.0242 },
  Rietavas: { lat: 55.7236, lng: 21.9319 },
  Skuodas: { lat: 56.2667, lng: 21.5333 },
  Nida: { lat: 55.3075, lng: 21.0061 },
  Trakai: { lat: 54.6378, lng: 24.9342 },
  "Švenčionys": { lat: 55.1333, lng: 26.1667 },
};

export const LT_CITY_NAMES = Object.keys(LT_CITY_COORDS);

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
  const norm = NORM(trimmed);
  for (const city of LT_CITY_NAMES) {
    if (norm.includes(NORM(city))) return city;
  }
  const first = trimmed.split(",")[0]?.trim();
  if (first) {
    for (const city of LT_CITY_NAMES) {
      if (NORM(first).includes(NORM(city)) || NORM(city).includes(NORM(first))) {
        return city;
      }
    }
  }
  return undefined;
}

export function searchParcelLockers(opts: {
  providerId: ShippingProviderId;
  query?: string;
  city?: string;
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

  return lockers
    .sort((a, b) => a.city.localeCompare(b.city, "lt"))
    .slice(0, limit);
}

function transitDaysFromDistance(km: number): { min: number; max: number } {
  if (km <= 5) return { min: 1, max: 1 };
  if (km <= 80) return { min: 1, max: 2 };
  if (km <= 180) return { min: 2, max: 3 };
  if (km <= 320) return { min: 2, max: 4 };
  return { min: 3, max: 5 };
}

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

  const origin = LT_CITY_COORDS[originCity];
  const destination = LT_CITY_COORDS[destinationCity];
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
