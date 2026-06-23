/** Skelbiu.lt-style category tree and helpers for general listings. */

export interface SkelbiuCategoryNode {
  label: string;
  children?: SkelbiuCategoryNode[];
}

export const SKELBIU_CATEGORY_TREE: SkelbiuCategoryNode[] = [
  {
    label: "Pramogos",
    children: [
      {
        label: "Turizmas",
        children: [
          {
            label: "Turizmo prekės",
            children: [
              {
                label: "Kepsninės, šašlykinės",
                children: [
                  { label: "Keramikinės kepsninės" },
                  { label: "Metalinės kepsninės" },
                  { label: "Kita" },
                ],
              },
              { label: "Palapinės" },
              { label: "Miegmaišiai" },
              { label: "Kita" },
            ],
          },
          { label: "Kempingas" },
        ],
      },
      { label: "Sportas" },
      { label: "Kolekcijos" },
    ],
  },
  {
    label: "Buitis",
    children: [
      {
        label: "Baldai",
        children: [
          { label: "Sofos" },
          { label: "Stalo baldai" },
          { label: "Spintos" },
          { label: "Kita" },
        ],
      },
      {
        label: "Virtuvės įranga",
        children: [
          { label: "Kavos aparatai" },
          { label: "Indaplovės" },
          { label: "Kita" },
        ],
      },
      { label: "Namų tekstilė" },
    ],
  },
  {
    label: "Elektronika",
    children: [
      {
        label: "Mobilieji telefonai",
        children: [
          { label: "Apple" },
          { label: "Samsung" },
          { label: "Kita" },
        ],
      },
      {
        label: "Kompiuteriai",
        children: [
          { label: "Nešiojami" },
          { label: "Staliniai" },
          { label: "Kita" },
        ],
      },
      { label: "Televizoriai" },
      { label: "Garso įranga" },
    ],
  },
  {
    label: "Daržas ir sodas",
    children: [
      { label: "Vejos pjovimo technika" },
      { label: "Sodo įrankiai" },
      { label: "Augalai" },
    ],
  },
  {
    label: "Vaikams",
    children: [
      { label: "Vežimėliai" },
      { label: "Žaislai" },
      { label: "Kita" },
    ],
  },
  { label: "Kita" },
];

export const LISTING_ACTIONS = ["Siūlau", "Ieškau"] as const;
export const ITEM_CONDITIONS = ["Nauja", "Naudota"] as const;
export const SELLER_TYPES = [
  "Privatus asmuo",
  "Įmonė / verslas / komercinė veikla",
] as const;

export const LT_CITIES = [
  "Vilnius",
  "Kaunas",
  "Klaipėda",
  "Šiauliai",
  "Panevėžys",
  "Alytus",
  "Marijampolė",
  "Mažeikiai",
  "Jonava",
  "Utena",
  "Kita",
] as const;

export function formatSkelbiuCategory(parts: string[]): string {
  return parts.filter(Boolean).join(" › ");
}

export function parseSkelbiuCategory(value: string): string[] {
  return value.split("›").map((s) => s.trim()).filter(Boolean);
}

export function nodesAtPath(path: string[]): SkelbiuCategoryNode[] {
  if (path.length === 0) return SKELBIU_CATEGORY_TREE;
  let nodes = SKELBIU_CATEGORY_TREE;
  for (const segment of path) {
    const node = nodes.find((n) => n.label === segment);
    if (!node?.children) return [];
    nodes = node.children;
  }
  return nodes;
}

export function detectSkelbiuCategoryFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (/kamado|kepsnin|šašlyk|grill|bbq/i.test(t)) {
    return "Pramogos › Turizmas › Turizmo prekės › Kepsninės, šašlykinės › Keramikinės kepsninės";
  }
  if (/iphone|samsung|telefon/i.test(t)) {
    return "Elektronika › Mobilieji telefonai › Kita";
  }
  if (/macbook|laptop|nešiojam/i.test(t)) {
    return "Elektronika › Kompiuteriai › Nešiojami";
  }
  if (/sofa|sofk/i.test(t)) {
    return "Buitis › Baldai › Sofos";
  }
  if (/kavos aparat/i.test(t)) {
    return "Buitis › Virtuvės įranga › Kavos aparatai";
  }
  if (/vežimėli|stroller/i.test(t)) {
    return "Vaikams › Vežimėliai";
  }
  if (/vejospjov|žoliapjov/i.test(t)) {
    return "Daržas ir sodas › Vejos pjovimo technika";
  }
  return null;
}

export function detectListingActionFromText(text: string): string {
  return /ieškau|perku|reikia/i.test(text) ? "Ieškau" : "Siūlau";
}

export function detectConditionFromText(text: string): string | null {
  if (/\bnauj/i.test(text) && !/naudot/i.test(text)) return "Nauja";
  if (/naudot|dėvėt/i.test(text)) return "Naudota";
  return null;
}

export function isGeneralListingCategory(category: string): boolean {
  return ["electronics", "home", "other"].includes(category);
}

export function looksLikeGeneralListing(text: string, category?: string): boolean {
  if (category && isGeneralListingCategory(category)) return true;
  if (category === "services" || category === "jobs") return false;
  return /\b(parduod|parduodu|siūlau|ieškau|kamado|iphone|sofa|bald|technik)/i.test(text);
}
