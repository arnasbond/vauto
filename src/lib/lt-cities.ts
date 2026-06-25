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
  [/vilniuje|vilniui|vilnyje|vilnius/i, "Vilnius"],
  [/kaune|kauno|kaunas/i, "Kaunas"],
  [/klaip[eė]doje|klaip[eė]dos|klaip[eė]da/i, "Klaipėda"],
  [/[šs]iauliuose|[šs]iauli[uų]|[šs]iauliai/i, "Šiauliai"],
  [/panev[eė][žz]y(?:je|s|je)?|panev[eė][žz]io|panev[eė][žz]ys/i, "Panevėžys"],
  [/alytuje|alytus/i, "Alytus"],
  [/marijampol[eė]je|marijampol[eė]/i, "Marijampolė"],
  [/utenoje|utena/i, "Utena"],
  [/palangoje|palanga/i, "Palanga"],
  [/taurag[eė]je|taurag[eė]/i, "Tauragė"],
  [/k[eė]dainiuose|k[eė]dainiai/i, "Kėdainiai"],
  [/jonavoje|jonava/i, "Jonava"],
  [/pasvalyje|pasvalio|pasvalys/i, "Pasvalys"],
  [/mažeikiuose|mažeiki[uų]|mažeikiai|mazeikiuose|mazeikiai/i, "Mažeikiai"],
  [/telšiuose|telši[uų]|telšiai|telsiuose|telsiai/i, "Telšiai"],
  [/biržuose|birž[uų]|biržai|birzuose|birzai/i, "Biržai"],
  [/rokiškyje|rokiškio|rokiškis|rokiskyje|rokiskis/i, "Rokiškis"],
  [/kupiškyje|kupiškio|kupiškis|kupiskyje|kupiskis/i, "Kupiškis"],
  [/raseiniuose|raseiniai/i, "Raseiniai"],
  [/ukmerg[eė]je|ukmerg[eė]/i, "Ukmergė"],
  [/plung[eė]je|plung[eė]/i, "Plungė"],
  [/druskininkuose|druskininkai/i, "Druskininkai"],
  [/visagine|visagino|visaginas/i, "Visaginas"],
];

/** Fuzzy stem length for declension-tolerant city match (e.g. „panevežy“ → Panevėžys) */
function cityStem(city: string): string {
  const norm = NORM(city);
  const len = Math.min(7, Math.max(4, norm.length - 1));
  return norm.slice(0, len);
}

function tokenMatchesCity(token: string, city: string): boolean {
  const nw = NORM(token);
  if (nw.length < 4) return false;
  const cn = NORM(city);
  const overlap = Math.min(5, nw.length, cn.length);
  if (overlap >= 4 && nw.slice(0, overlap) === cn.slice(0, overlap)) return true;
  const stem = cityStem(city);
  return nw.startsWith(stem.slice(0, 4)) && stem.startsWith(nw.slice(0, Math.min(nw.length, stem.length)));
}

/** Declension + root fuzzy match — „Panevėžy“, „vilni“, „pasval“ */
export function detectCityFuzzy(text: string): string | undefined {
  for (const [pattern, city] of LT_CITY_PATTERNS) {
    if (pattern.test(text)) return city;
  }

  const norm = NORM(text);
  const words = norm.split(/[\s,.;:!?'"-]+/).filter((w) => w.length >= 3);
  const sorted = [...LT_CITY_NAMES].sort(
    (a, b) => NORM(b).length - NORM(a).length
  );

  for (const city of sorted) {
    const stem = cityStem(city);
    if (stem.length >= 5 && norm.includes(stem)) return city;
    for (const word of words) {
      if (tokenMatchesCity(word, city)) return city;
    }
  }

  return detectCityInText(text);
}

export function detectCityFromPatterns(text: string): string | undefined {
  return detectCityFuzzy(text);
}
