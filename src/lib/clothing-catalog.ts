/** VAUTO drabužių katalogas — kategorijos, dydžiai, siuntimas. */

export const FASHION_CATEGORY_ATTR = "fashionCategory";
/** Senesniuose skelbimuose — tik skaitymui */
export const LEGACY_FASHION_CATEGORY_ATTR = "vintedCategory";

export const FASHION_MAIN_GROUPS = [
  "Moterims",
  "Vyrams",
  "Vaikams",
  "Namams / Interjerui",
  "Augintiniams",
] as const;

export const FASHION_CATEGORY_TREE: Record<string, readonly string[]> = {
  Moterims: [
    "Striukės ir paltai",
    "Suknelės",
    "Kelnės ir džinsai",
    "Megztiniai",
    "Apatinis trikotažas",
    "Sportinė apranga",
    "Sportbačiai",
    "Bateliai",
    "Ilgaauliai",
    "Šlepetės",
    "Sandalai",
    "Krepšiai",
    "Kita",
  ],
  Vyrams: [
    "Marškinėliai",
    "Striukės ir paltai",
    "Kelnės ir džinsai",
    "Megztiniai",
    "Sportinė apranga",
    "Sportbačiai",
    "Bateliai",
    "Šlepetės",
    "Kita",
  ],
  Vaikams: [
    "Drabužiai pagal amžių/ūgį",
    "Žaislai",
    "Vežimėliai / Kėdutės",
    "Mokyklinės prekės",
    "Sportbačiai",
    "Kita",
  ],
  "Namams / Interjerui": [
    "Tekstilė — Patalynė",
    "Tekstilė — Rankšluosčiai",
    "Dekoras — Žvakės",
    "Dekoras — Veidrodžiai",
    "Indai / Virtuvė",
    "Kita",
  ],
  Augintiniams: ["Apranga", "Guoliai", "Transportas", "Kita"],
};

/** @deprecated use FASHION_CATEGORY_TREE */
export const FASHION_CATEGORIES: Record<string, string[]> = Object.fromEntries(
  Object.entries(FASHION_CATEGORY_TREE).map(([k, v]) => [k, [...v]])
);

export const FASHION_CONDITIONS = [
  "Nauja su etiketėmis",
  "Nauja be etiketės",
  "Labai gera",
  "Gera",
  "Patenkinama",
] as const;

export const FASHION_CLOTHING_SIZES = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "Plus Size",
] as const;

export const FASHION_SHOE_SIZES = [
  "35",
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "46+",
] as const;

export const FASHION_CHILD_HEIGHTS = [
  "50 cm",
  "56 cm",
  "62 cm",
  "68 cm",
  "74 cm",
  "80 cm",
  "86 cm",
  "92 cm",
  "98 cm",
  "104 cm",
  "110 cm",
  "116 cm",
  "122 cm",
  "128 cm",
  "134 cm",
  "140 cm",
  "146 cm",
  "152 cm",
  "158 cm",
  "164 cm",
  "170 cm",
  "176 cm",
] as const;

export const FASHION_SHIPPING_OPTIONS = [
  "LP Express / Omniva terminalas",
  "Paštas",
  "Atsiėmimas gyvai",
] as const;

export const CLOTHING_SIZES = [
  ...FASHION_CLOTHING_SIZES,
  ...FASHION_SHOE_SIZES,
  "Vienas dydis",
] as const;

export const POPULAR_BRANDS = [
  "Zara",
  "H&M",
  "Nike",
  "Adidas",
  "Mango",
  "Reserved",
  "Pull&Bear",
  "Bershka",
  "Stradivarius",
  "Massimo Dutti",
  "Levi's",
  "Tommy Hilfiger",
  "Calvin Klein",
  "Guess",
  "Puma",
  "New Balance",
  "Vans",
  "Converse",
  "Kita",
] as const;

export const CLOTHING_COLORS = [
  "Juoda",
  "Balta",
  "Pilka",
  "Mėlyna",
  "Raudona",
  "Rožinė",
  "Žalia",
  "Geltona",
  "Ruda",
  "Smėlio",
  "Violetinė",
  "Oranžinė",
  "Daugiaspalvė",
  "Kita",
] as const;

const BRAND_ALIASES: Record<string, string> = {
  zara: "Zara",
  nike: "Nike",
  adidas: "Adidas",
  mango: "Mango",
  hm: "H&M",
  "h&m": "H&M",
  reserved: "Reserved",
  puma: "Puma",
  vans: "Vans",
  converse: "Converse",
};

const SHOE_SUB_RE = /bat|auli|šlepet|sandal|sportbač/i;

export function readFashionCategory(
  attrs: Record<string, string | string[] | undefined>
): string {
  const primary = attrs[FASHION_CATEGORY_ATTR];
  const legacy = attrs[LEGACY_FASHION_CATEGORY_ATTR];
  if (Array.isArray(primary)) return primary.join(", ");
  if (typeof primary === "string" && primary.trim()) return primary;
  if (Array.isArray(legacy)) return legacy.join(", ");
  if (typeof legacy === "string") return legacy;
  return "";
}

export function subcategoriesFor(group: string): string[] {
  return [...(FASHION_CATEGORY_TREE[group] ?? [])];
}

export function isShoeSubcategory(sub: string): boolean {
  return SHOE_SUB_RE.test(sub);
}

export function isChildHeightSubcategory(group: string, sub: string): boolean {
  return group === "Vaikams" && /drabuž|amži|ūg/i.test(sub);
}

export function sizesForFashionListing(group: string, sub: string): readonly string[] {
  if (isShoeSubcategory(sub)) return FASHION_SHOE_SIZES;
  if (isChildHeightSubcategory(group, sub)) return FASHION_CHILD_HEIGHTS;
  return FASHION_CLOTHING_SIZES;
}

export function formatFashionCategory(group: string, sub: string): string {
  return sub ? `${group} › ${sub}` : group;
}

export function parseFashionCategory(value: string): { group: string; sub: string } {
  const [group = "", sub = ""] = value.split("›").map((s) => s.trim());
  return { group, sub };
}

export function detectBrandFromText(text: string): string | null {
  const t = text.toLowerCase();
  for (const [key, brand] of Object.entries(BRAND_ALIASES)) {
    if (t.includes(key)) return brand;
  }
  const match = POPULAR_BRANDS.find((b) => t.includes(b.toLowerCase()));
  return match ?? null;
}

export function detectSizeFromText(text: string): string | null {
  const m = text.match(/\b(XXS|XS|S|M|L|XL|XXL|\d{2})\b/i);
  if (!m) return null;
  const val = m[1].toUpperCase();
  return CLOTHING_SIZES.includes(val as (typeof CLOTHING_SIZES)[number]) ? val : null;
}

export function detectClothingGroupFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(augintin|šun|kat)/i.test(t)) return "Augintiniams";
  if (/\b(nam|interjer|tekstil|dekor)/i.test(t)) return "Namams / Interjerui";
  if (/\b(vaik|kūdik|mergait|berniuk)/i.test(t)) return "Vaikams";
  if (/\b(vyr|vyrišk)/i.test(t)) return "Vyrams";
  if (/\b(moter|moterišk|suknel|palto)/i.test(t)) return "Moterims";
  return null;
}

export function detectSubcategoryFromText(text: string, group: string): string | null {
  const t = text.toLowerCase();
  const subs = subcategoriesFor(group);
  if (/\bsuknel/i.test(t)) return subs.find((s) => /suknel/i.test(s)) ?? null;
  if (/\bstriuk|palt|švark/i.test(t)) return subs.find((s) => /striuk|palt/i.test(s)) ?? null;
  if (/\bbat|batų|nike air|adidas/i.test(t)) return subs.find((s) => SHOE_SUB_RE.test(s)) ?? null;
  if (/\bkeln|džins/i.test(t)) return subs.find((s) => /keln/i.test(s)) ?? null;
  if (/\bkrepš|rankin/i.test(t)) return subs.find((s) => /krepš/i.test(s)) ?? null;
  return null;
}

export function looksLikeClothingListing(text: string, category?: string): boolean {
  if (category === "clothing") return true;
  return /\b(drabuž|aprang|suknel|striuk|palt|bat|dydis|dydžio|prekės ženkl|zara|nike|adidas|h&m|spinta|megztin|marškin|krepš)/i.test(
    text
  );
}
