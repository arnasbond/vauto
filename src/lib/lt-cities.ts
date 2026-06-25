import type { UserCoords } from "@/lib/geolocation";

/** Lithuanian city centers — used for geocoding listings and radius filters */
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
};

export const LT_CITY_NAMES = Object.keys(LT_CITY_COORDS);

const NORM = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();

export function coordsForLtCity(city: string): UserCoords | null {
  const norm = NORM(city);
  const key = LT_CITY_NAMES.find((k) => NORM(k) === norm);
  return key ? LT_CITY_COORDS[key]! : null;
}

/** Match city name inside free-form location text (e.g. „Kaunas, Senamiestis“) */
export function detectCityInText(text: string): string | undefined {
  const lower = NORM(text);
  for (const city of LT_CITY_NAMES) {
    if (lower.includes(NORM(city))) return city;
  }
  return undefined;
}

export const LT_CITY_PATTERNS: Array<[RegExp, string]> = [
  [/vilniuje|vilnius/i, "Vilnius"],
  [/kaune|kaunas/i, "Kaunas"],
  [/klaip[eė]doje|klaip[eė]da/i, "Klaipėda"],
  [/[šs]iauliuose|[šs]iauliai/i, "Šiauliai"],
  [/panev[eė][žz]yje|panev[eė][žz]ys/i, "Panevėžys"],
  [/alytuje|alytus/i, "Alytus"],
  [/marijampol[eė]je|marijampol[eė]/i, "Marijampolė"],
  [/utenoje|utena/i, "Utena"],
  [/palangoje|palanga/i, "Palanga"],
  [/taurag[eė]je|taurag[eė]/i, "Tauragė"],
  [/k[eė]dainiuose|k[eė]dainiai/i, "Kėdainiai"],
  [/jonavoje|jonava/i, "Jonava"],
  [/pasvalyje|pasvalys/i, "Pasvalys"],
  [/mažeikiuose|mažeikiai|mazeikiuose|mazeikiai/i, "Mažeikiai"],
  [/telšiuose|telšiai|telsiuose|telsiai/i, "Telšiai"],
  [/biržuose|biržai|birzuose|birzai/i, "Biržai"],
  [/rokiškyje|rokiškis|rokiskyje|rokiskis/i, "Rokiškis"],
  [/kupiškyje|kupiškis|kupiskyje|kupiskis/i, "Kupiškis"],
  [/raseiniuose|raseiniai/i, "Raseiniai"],
  [/ukmerg[eė]je|ukmerg[eė]/i, "Ukmergė"],
  [/plung[eė]je|plung[eė]/i, "Plungė"],
  [/druskininkuose|druskininkai/i, "Druskininkai"],
];

export function detectCityFromPatterns(text: string): string | undefined {
  for (const [pattern, city] of LT_CITY_PATTERNS) {
    if (pattern.test(text)) return city;
  }
  return detectCityInText(text);
}
