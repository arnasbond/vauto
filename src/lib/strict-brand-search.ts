import type { Listing } from "@/lib/types";
import {
  detectVehicleMake,
  VEHICLE_BRAND_PATTERN,
} from "@/lib/vehicle-keywords";

function normToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Canonical make keys for strict equality checks. */
const MAKE_CANONICAL: Record<string, string> = {
  bmw: "bmw",
  audi: "audi",
  vw: "volkswagen",
  volkswagen: "volkswagen",
  mercedes: "mercedes-benz",
  benz: "mercedes-benz",
  "mercedes benz": "mercedes-benz",
  toyota: "toyota",
  opel: "opel",
  ford: "ford",
  peugeot: "peugeot",
  citroen: "citroen",
  renault: "renault",
  skoda: "skoda",
  seat: "seat",
  nissan: "nissan",
  honda: "honda",
  mazda: "mazda",
  volvo: "volvo",
  kia: "kia",
  hyundai: "hyundai",
  mitsubishi: "mitsubishi",
  subaru: "subaru",
  lexus: "lexus",
  porsche: "porsche",
  fiat: "fiat",
  alfa: "alfa-romeo",
  jeep: "jeep",
  dodge: "dodge",
  chevrolet: "chevrolet",
  tesla: "tesla",
  suzuki: "suzuki",
  dacia: "dacia",
  lada: "lada",
  saab: "saab",
  mini: "mini",
  "land rover": "land-rover",
  "range rover": "land-rover",
};

const BRAND_ALIASES: Array<[RegExp, string]> = [
  [/\bvol\s+vo\b/gi, "volvo"],
  [/\bmerc(?:edes)?\s+benz\b/gi, "mercedes benz"],
  [/\bmerc\b/gi, "mercedes"],
  [/\bvw\b/gi, "volkswagen"],
];

function normalizeBrandAliases(text: string): string {
  let t = text;
  for (const [pattern, replacement] of BRAND_ALIASES) {
    t = t.replace(pattern, replacement);
  }
  return t;
}

export function canonicalMakeKey(raw: string): string | null {
  const n = normToken(raw);
  if (!n) return null;
  if (MAKE_CANONICAL[n]) return MAKE_CANONICAL[n];
  for (const [alias, canon] of Object.entries(MAKE_CANONICAL)) {
    if (n === alias || n.startsWith(`${alias} `) || n.includes(` ${alias}`)) {
      return canon;
    }
  }
  return n.replace(/\s+/g, "-");
}

export function extractStrictVehicleMake(query: string): string | null {
  const normalized = normalizeBrandAliases(query.trim());
  if (!normalized || !VEHICLE_BRAND_PATTERN.test(normalized)) return null;
  const detected = detectVehicleMake(normalized);
  if (!detected) return null;
  return canonicalMakeKey(detected);
}

function listingMakeRaw(listing: Listing): string {
  const attrs = listing.attributes ?? {};
  return String(attrs.make ?? attrs.markė ?? attrs.marke ?? "").trim();
}

function titleMentionsMake(title: string, makeKey: string): boolean {
  const t = normToken(title);
  const aliases = Object.entries(MAKE_CANONICAL)
    .filter(([, canon]) => canon === makeKey)
    .map(([alias]) => alias);
  const tokens = [makeKey.replace(/-/g, " "), ...aliases];
  return tokens.some((token) => {
    if (!token) return false;
    const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(t);
  });
}

/** Strict brand match — ignores description-only keyword mentions. */
export function listingMatchesStrictBrandQuery(
  listing: Listing,
  query: string
): boolean {
  const requiredKey = extractStrictVehicleMake(query);
  if (!requiredKey) return true;

  if (listing.category !== "vehicles") return false;

  const listingMake = listingMakeRaw(listing);
  if (listingMake) {
    const listingKey = canonicalMakeKey(listingMake);
    return listingKey === requiredKey;
  }

  return titleMentionsMake(listing.title, requiredKey);
}

export function applyStrictBrandFilter<T extends Listing>(
  listings: T[],
  query: string
): T[] {
  const requiredKey = extractStrictVehicleMake(query);
  if (!requiredKey) return listings;
  return listings.filter((l) => listingMatchesStrictBrandQuery(l, query));
}

export function isStrictBrandSearch(query: string): boolean {
  return extractStrictVehicleMake(query) !== null;
}
