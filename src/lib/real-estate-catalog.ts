/** LT real estate catalog for aruodas-style listing wizard. */

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

export const MUNICIPALITIES = [
  "Vilniaus miesto",
  "Vilniaus rajono",
  "Kauno miesto",
  "Kauno rajono",
  "Klaipėdos miesto",
  "Klaipėdos rajono",
  "Šiaulių miesto",
  "Panevėžio miesto",
  "Alytaus miesto",
] as const;

export const SETTLEMENTS_BY_MUNICIPALITY: Record<string, string[]> = {
  "Vilniaus miesto": ["Vilnius", "Naujamiestis", "Senamiestis", "Žirmūnai", "Antakalnis"],
  "Vilniaus rajono": ["Trakai", "Nemenčinė", "Mickūnai", "Rudamina"],
  "Kauno miesto": ["Kaunas", "Šilainiai", "Centras", "Aleksotas", "Dainava"],
  "Kauno rajono": ["Garliava", "Birštonas", "Kulautuva"],
  "Klaipėdos miesto": ["Klaipėda", "Melnragė", "Giruliai"],
  "Klaipėdos rajono": ["Gargždai", "Priekulė", "Dovilai"],
  "Šiaulių miesto": ["Šiauliai", "Centras", "Dainiai"],
  "Panevėžio miesto": ["Panevėžys", "Centras", "Rožynas"],
  "Alytaus miesto": ["Alytus", "Dainava", "Senamiestis"],
};

export const MICRODISTRICTS_BY_SETTLEMENT: Record<string, string[]> = {
  Vilnius: ["Antakalnis", "Fabijoniškės", "Justiniškės", "Karoliniškės", "Lazdynai", "Naujininkai", "Pašilaičiai", "Pilaitė", "Šeškinė", "Žirmūnai"],
  Kaunas: ["Aleksotas", "Centras", "Dainava", "Eiguliai", "Gričiupis", "Šančiai", "Šilainiai", "Žaliakalnis"],
  Klaipėda: ["Centras", "Melnragė", "Smiltynė", "Vingis"],
  Panevėžys: ["Centras", "Rožynas", "Stetiškės"],
  Šiauliai: ["Centras", "Dainiai", "Gytariai"],
};

export const STREETS_BY_SETTLEMENT: Record<string, string[]> = {
  Vilnius: ["Gedimino pr.", "Konstitucijos pr.", "Ukmergės g.", "Ozo g.", "Kalvarijų g.", "Savanorių pr."],
  Kaunas: ["Laisvės al.", "Savanorių pr.", "Vytauto pr.", "Pramonės pr.", "Kovo 11-osios g."],
  Klaipėda: ["Tiltų g.", "H. Manto g.", "Taikos pr.", "Minijos g."],
  Panevėžys: ["Respublikos g.", "Klaipėdos g.", "S. Dariaus ir S. Girėno g."],
  Šiauliai: ["Vilniaus g.", "Tilžės g.", "Pramonės g."],
};

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
  "Balkonas",
  "Terasa",
  "Parkavimo vieta",
  "Garažas",
  "Rūsys",
  "Liftas",
  "Signalizacija",
  "Kondicionierius",
  "Židinys",
  "Sauna",
  "Baseinas",
  "Su baldais",
  "Su buitine technika",
] as const;

export const SELLER_ROLES = [
  "Privatus asmuo",
  "Tarpininkas",
  "Vystytojas/statytojas",
  "Kitas verslo subjektas",
] as const;

export const ROOM_QUICK = ["1", "2", "3", "4"] as const;

export function settlementsFor(municipality: string): string[] {
  return SETTLEMENTS_BY_MUNICIPALITY[municipality] ?? [];
}

export function microdistrictsFor(settlement: string): string[] {
  return MICRODISTRICTS_BY_SETTLEMENT[settlement] ?? [];
}

export function streetsFor(settlement: string): string[] {
  return STREETS_BY_SETTLEMENT[settlement] ?? [];
}

export function realEstateSummaryLabel(attrs: Record<string, string | string[] | undefined>): string {
  const type = String(attrs.propertyType ?? "");
  const typeLabel = PROPERTY_TYPES.find((p) => p.id === type)?.label ?? "";
  const tx = String(attrs.transactionType ?? "");
  const settlement = String(attrs.settlement ?? attrs.municipality ?? "");
  const area = String(attrs.area ?? "");
  const parts = [typeLabel, tx, settlement, area ? `${area} m²` : ""].filter(Boolean);
  return parts.join(" · ");
}

export function detectPropertyTypeFromText(text: string): PropertyTypeId | null {
  const t = text.toLowerCase();
  if (/\bbutas?\b/i.test(t)) return "butas";
  if (/\bnamas|sodyb|sodo nam/i.test(t)) return "namas";
  if (/\bsklyp/i.test(t)) return "sklypas";
  if (/\bpatalp|komercin|biur/i.test(t)) return "patalpos";
  if (/\bgaraž|parkavimo viet/i.test(t)) return "garazas";
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
