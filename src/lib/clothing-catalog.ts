/** Vinted-style clothing catalog for listing wizard. */

export const VINTED_CATEGORIES: Record<string, string[]> = {
  Moterims: [
    "Suknelės",
    "Striukės ir paltai",
    "Megztiniai",
    "Kelnės ir džinsai",
    "Batai",
    "Krepšiai",
    "Sportinė apranga",
    "Kita",
  ],
  Vyrams: [
    "Marškinėliai",
    "Striukės ir paltai",
    "Kelnės ir džinsai",
    "Batai",
    "Sportinė apranga",
    "Kita",
  ],
  Vaikams: ["Mergaitėms", "Berniukams", "Kūdikiams", "Kita"],
  Aksesuarai: ["Akiniai", "Juvelyrika", "Šalikai", "Diržai", "Kita"],
  Namams: ["Namų tekstilė", "Dekoras", "Kita"],
  Kita: ["Kita"],
};

export const VINTED_CONDITIONS = ["Nauja su etiketėmis", "Nauja be etiketės", "Labai gera", "Gera", "Patenkinama"] as const;

export const CLOTHING_SIZES = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "34",
  "36",
  "38",
  "40",
  "42",
  "44",
  "46",
  "48",
  "50",
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

export function subcategoriesFor(group: string): string[] {
  return VINTED_CATEGORIES[group] ?? [];
}

export function formatVintedCategory(group: string, sub: string): string {
  return sub ? `${group} › ${sub}` : group;
}

export function parseVintedCategory(value: string): { group: string; sub: string } {
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
  if (/\b(vaik|kūdik|mergait|berniuk)/i.test(t)) return "Vaikams";
  if (/\b(vyr|vyrišk)/i.test(t)) return "Vyrams";
  if (/\b(aksesuar|rankin|krepš|dirž|šalik)/i.test(t)) return "Aksesuarai";
  if (/\b(moter|moterišk|suknel|palto)/i.test(t)) return "Moterims";
  return null;
}

export function detectSubcategoryFromText(text: string, group: string): string | null {
  const t = text.toLowerCase();
  const subs = subcategoriesFor(group);
  if (/\bsuknel/i.test(t)) return subs.find((s) => /suknel/i.test(s)) ?? null;
  if (/\bstriuk|palt|švark/i.test(t)) return subs.find((s) => /striuk|palt/i.test(s)) ?? null;
  if (/\bbat|batų|nike air|adidas/i.test(t)) return subs.find((s) => /bat/i.test(s)) ?? null;
  if (/\bkeln|džins/i.test(t)) return subs.find((s) => /keln/i.test(s)) ?? null;
  if (/\bkrepš|rankin/i.test(t)) return subs.find((s) => /krepš/i.test(s)) ?? null;
  return null;
}

export function looksLikeClothingListing(text: string, category?: string): boolean {
  if (category === "clothing") return true;
  return /\b(drabuž|aprang|suknel|striuk|palt|bat|dydis|dydžio|prekės ženkl|zara|nike|adidas|h&m|vinted|megztin|marškin|krepš)/i.test(
    text
  );
}
