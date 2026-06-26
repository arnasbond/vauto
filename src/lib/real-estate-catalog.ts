/** LT real estate catalog for aruodas-style listing wizard. */

export {
  MUNICIPALITIES,
  SETTLEMENTS_BY_MUNICIPALITY,
  MICRODISTRICTS_BY_SETTLEMENT,
  STREETS_BY_SETTLEMENT,
  settlementsFor,
  microdistrictsFor,
  streetsFor,
  allSettlements,
  type MunicipalityName,
} from "@/data/lithuania-locations";

export const PROPERTY_TYPES = [
  { id: "butas", label: "Butas", icon: "building" },
  { id: "namas", label: "Namas, sodyba, sodo namas", icon: "home" },
  { id: "sklypas", label: "Sklypas", icon: "plot" },
  { id: "patalpos", label: "Patalpos", icon: "commercial" },
  { id: "garazas", label: "Garažas, vieta", icon: "garage" },
  { id: "trumpalaike", label: "Trumpalaikė nuoma", icon: "short" },
  { id: "ieskau", label: "Ieškau NT", icon: "search" },
  { id: "uzsienis", label: "Užsienio objektas", icon: "globe" },
] as const;

export type PropertyTypeId = (typeof PROPERTY_TYPES)[number]["id"];

export const TRANSACTION_TYPES = ["Pardavimui", "Nuomai"] as const;

export const PROPERTY_TYPE_LABELS: Record<PropertyTypeId, string> = {
  butas: "BUTAS",
  namas: "NAMAS, SODYBA, SODO NAMAS",
  sklypas: "SKLYPAS",
  patalpos: "PATALPOS",
  garazas: "GARAŽAS, VIETA",
  trumpalaike: "TRUMPALAIKĖ NUOMA",
  ieskau: "IEŠKAU NT",
  uzsienis: "UŽSIENIO OBJEKTAS",
};

export function propertyTypeNeedsAction(type: string): boolean {
  return ["butas", "namas", "sklypas", "patalpos", "garazas", "uzsienis"].includes(type);
}

export function defaultTransactionForType(type: string): string {
  if (type === "trumpalaike" || type === "ieskau") return "Nuomai";
  return "Pardavimui";
}

export const HOUSE_TYPES = [
  "Namas (gyvenamasis)",
  "Namo dalis",
  "Sodo namas",
  "Sublokuotas namas",
  "Sodyba",
  "Kita",
] as const;

export const BUILDING_TYPES = [
  "Mūrinis",
  "Blokinis",
  "Monolitinis",
  "Medinis",
  "Karkasinis",
  "Rąstinis",
  "Skydinis",
  "Kita",
] as const;

export const FURNISHING_OPTIONS = [
  "Įrengtas",
  "Dalinė apdaila",
  "Neįrengtas",
  "Remontuotinas",
] as const;

export const CONDITION_TYPES = [
  "Įrengtas",
  "Dalinė apdaila",
  "Neįrengtas",
  "Nebaigtas statyti",
  "Pamatai",
  "Kita",
] as const;

export const HEATING_OPTIONS = [
  "Centrinis",
  "Centrinis kolektorinis",
  "Dujinis",
  "Elektra",
  "Geoterminis",
  "Aeroterminis",
  "Kietu kuru",
  "Skystu kuru",
  "Saulės energija",
  "Kita",
] as const;

export const FEATURE_OPTIONS = [
  "Balkonas / Terasa",
  "Sandėliukas",
  "Parkavimo vieta",
  "Aptverta teritorija",
  "Parduodama su baldais",
  "Balkonas",
  "Terasa",
  "Garažas",
  "Rūsys",
  "Liftas",
  "Signalizacija",
  "Kondicionierius",
  "Židinys",
  "Sauna",
  "Baseinas",
  "Su buitine technika",
] as const;

/** Aruodas griežti objekto tipai */
export const ARUODAS_PROPERTY_TYPES = [
  { id: "butas", label: "Butas" },
  { id: "namas", label: "Namas" },
  { id: "sodyba", label: "Sodyba" },
  { id: "sodo_namelis", label: "Sodo namelis" },
  { id: "zemes_sklypas", label: "Žemės sklypas" },
  { id: "misko_sklypas", label: "Miško sklypas" },
  { id: "patalpos", label: "Patalpos / Komercija" },
  { id: "garazas", label: "Garažas" },
] as const;

export const ARUODAS_TRANSACTION_TYPES = [
  "Parduoda",
  "Nuomoja",
  "Trumpalaikė nuoma",
] as const;

export const LAND_PURPOSE_OPTIONS = [
  "Namų valda",
  "Žemės ūkio",
  "Komercinė",
  "Miškų ūkio",
  "Sodų",
  "Rekreacinė",
] as const;

export const LAND_UTILITY_OPTIONS = [
  "Elektra",
  "Dujos",
  "Vandentiekis",
] as const;

export const LAND_AREA_UNITS = ["a", "ha"] as const;

export function isLandPropertyType(type: string): boolean {
  return type === "zemes_sklypas" || type === "misko_sklypas" || type === "sklypas";
}

export function isBuildingPropertyType(type: string): boolean {
  return ["butas", "namas", "sodyba", "sodo_namelis", "patalpos", "garazas"].includes(type);
}

export const SELLER_ROLES = [
  "Privatus asmuo",
  "Tarpininkas",
  "Vystytojas/statytojas",
  "Kitas verslo subjektas",
] as const;

export const ROOM_QUICK = ["1", "2", "3", "4"] as const;

export function formatRealEstateArea(value: string | string[] | undefined): string {
  const s = String(Array.isArray(value) ? value[0] : value ?? "").trim();
  if (!s) return "";
  if (/\b(m²|m2|kv\.?\s*m|\ba\b|ha\b)/i.test(s)) return s;
  return `${s} m²`;
}

export function realEstateSummaryLabel(attrs: Record<string, string | string[] | undefined>): string {
  const type = String(attrs.propertyType ?? "");
  const typeLabel = PROPERTY_TYPES.find((p) => p.id === type)?.label ?? "";
  const tx = String(attrs.transactionType ?? "");
  const settlement = String(attrs.settlement ?? attrs.municipality ?? "");
  const area = formatRealEstateArea(attrs.area);
  const parts = [typeLabel, tx, settlement, area].filter(Boolean);
  return parts.join(" · ");
}

export function detectPropertyTypeFromText(text: string): PropertyTypeId | null {
  const t = text.toLowerCase();
  if (/\bbut/i.test(t)) return "butas";
  if (/\bnam|sodyb|sodo nam/i.test(t)) return "namas";
  if (/\bžem|zem|sklyp/i.test(t)) return "sklypas";
  if (/\bkotedž|kotedz/i.test(t)) return "namas";
  if (/\bpatalp|komercin|biur/i.test(t)) return "patalpos";
  if (/\bgaraž|garaz|parkavimo viet/i.test(t)) return "garazas";
  if (/\btrumpalai/i.test(t)) return "trumpalaike";
  if (/\bieškau nt|ieskau nt/i.test(t)) return "ieskau";
  if (/\bužsien|uzsien/i.test(t)) return "uzsienis";
  return null;
}

export function detectTransactionFromText(text: string): string | null {
  if (/\bnuom|rent/i.test(text)) return "Nuomai";
  if (/\bpardav|parduod|sale/i.test(text)) return "Pardavimui";
  return null;
}

export function buildLocationString(attrs: Record<string, string | string[] | undefined>): string {
  const parts = [
    attrs.settlement,
    attrs.microdistrict,
    attrs.street,
    attrs.houseNumber ? `nr. ${attrs.houseNumber}` : undefined,
  ]
    .map((v) => (Array.isArray(v) ? v[0] : v))
    .filter((v) => v && String(v).trim());
  return parts.join(", ");
}
