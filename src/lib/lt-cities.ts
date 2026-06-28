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
