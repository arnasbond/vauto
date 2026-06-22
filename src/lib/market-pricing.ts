import type { Listing } from "@/lib/types";

export type MarketSource = "skelbiu.lt";

export interface MarketComparable {
  title: string;
  category: Listing["category"];
  city: string;
  price: number;
  source: MarketSource;
  url?: string;
  keywords: string[];
}

export interface MarketPriceSnapshot {
  source: MarketSource;
  query: string;
  city: string;
  scope: "city" | "national";
  comparables: MarketComparable[];
}

const SOURCE: MarketSource = "skelbiu.lt";

const MARKET_INDEX: MarketComparable[] = [
  {
    title: "Ratlankiai R16 5x112, 4 vnt.",
    category: "vehicles",
    city: "Panevėžys",
    price: 50,
    source: SOURCE,
    keywords: ["ratlankiai", "r16", "auto dalys", "5x112", "garažas"],
  },
  {
    title: "Lengvojo automobilio ratlankiai R16",
    category: "vehicles",
    city: "Kaunas",
    price: 65,
    source: SOURCE,
    keywords: ["ratlankiai", "r16", "padangos", "auto dalys"],
  },
  {
    title: "Naudoti ratlankiai R15/R16 komplektas",
    category: "vehicles",
    city: "Vilnius",
    price: 55,
    source: SOURCE,
    keywords: ["ratlankiai", "r16", "naudoti", "komplektas"],
  },
  {
    title: "iPhone 13 128GB, gera būklė",
    category: "electronics",
    city: "Vilnius",
    price: 330,
    source: SOURCE,
    keywords: ["iphone", "iphone 13", "128gb", "telefonas"],
  },
  {
    title: "Apple iPhone 13 128GB",
    category: "electronics",
    city: "Kaunas",
    price: 315,
    source: SOURCE,
    keywords: ["iphone", "iphone 13", "128gb", "mobilus"],
  },
  {
    title: "Samsung Galaxy S22",
    category: "electronics",
    city: "Klaipėda",
    price: 290,
    source: SOURCE,
    keywords: ["samsung", "galaxy", "telefonas", "android"],
  },
  {
    title: "Trek dviratis M dydis",
    category: "other",
    city: "Šiauliai",
    price: 165,
    source: SOURCE,
    keywords: ["dviratis", "trek", "sportas"],
  },
  {
    title: "Dviratis Trek naudotas",
    category: "other",
    city: "Vilnius",
    price: 145,
    source: SOURCE,
    keywords: ["dviratis", "trek"],
  },
  {
    title: "VW Golf 2015 dyzelis",
    category: "vehicles",
    city: "Kaunas",
    price: 4700,
    source: SOURCE,
    keywords: ["vw", "golf", "2015", "dyzelis", "automobilis"],
  },
  {
    title: "VW Golf VII 1.6 TDI",
    category: "vehicles",
    city: "Vilnius",
    price: 5100,
    source: SOURCE,
    keywords: ["vw", "golf", "tdi", "automobilis"],
  },
  {
    title: "Žolės pjovimas ir aplinkos tvarkymas",
    category: "services",
    city: "Kaunas",
    price: 30,
    source: SOURCE,
    keywords: ["žolė", "pjovimas", "sodas", "paslauga"],
  },
  {
    title: "Meistro paslaugos, remontas",
    category: "services",
    city: "Klaipėda",
    price: 35,
    source: SOURCE,
    keywords: ["meistras", "remontas", "montavimas"],
  },
  {
    title: "2 kambarių butas nuomai",
    category: "real_estate",
    city: "Vilnius",
    price: 620,
    source: SOURCE,
    keywords: ["butas", "nuoma", "2 kambariai", "nekilnojamas"],
  },
  {
    title: "Sandėlininkas pilnu etatu",
    category: "jobs",
    city: "Kaunas",
    price: 1250,
    source: SOURCE,
    keywords: ["darbas", "sandėlininkas", "pilnas etatas"],
  },
];

const CITY_ALIASES: Record<string, string> = {
  vilniuje: "Vilnius",
  vilnius: "Vilnius",
  kaune: "Kaunas",
  kaunas: "Kaunas",
  klaipėdoje: "Klaipėda",
  klaipeda: "Klaipėda",
  klaipėda: "Klaipėda",
  šiauliuose: "Šiauliai",
  siauliai: "Šiauliai",
  šiauliai: "Šiauliai",
  panevėžyje: "Panevėžys",
  panevezys: "Panevėžys",
  panevėžys: "Panevėžys",
  alytuje: "Alytus",
  alytus: "Alytus",
  marijampolėje: "Marijampolė",
  marijampole: "Marijampolė",
  marijampolė: "Marijampolė",
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ė/g, "e")
    .replace(/š/g, "s")
    .replace(/ų|ū/g, "u")
    .replace(/ž/g, "z")
    .replace(/ą/g, "a")
    .replace(/č/g, "c")
    .replace(/į/g, "i");
}

function tokensForListing(target: Pick<Listing, "title" | "category" | "location" | "tags" | "description" | "attributes">): string[] {
  const attrTokens = Object.entries(target.attributes ?? {}).flatMap(([key, value]) => [
    key,
    ...(Array.isArray(value) ? value : value ? [value] : []),
  ]);
  return [
    target.title,
    target.category,
    target.location,
    target.description ?? "",
    ...target.tags,
    ...attrTokens,
  ]
    .join(" ")
    .split(/[\s,.;:!?()[\]'"„“—–-]+/)
    .map((token) => normalizeText(token.trim()))
    .filter((token) => token.length >= 3);
}

function resolveCity(location: string): string {
  const normalized = location.trim().toLowerCase();
  return CITY_ALIASES[normalized] ?? location.split(",")[0]?.trim() ?? "Lietuva";
}

function scoreComparable(tokens: string[], item: MarketComparable): number {
  const haystack = normalizeText(
    [item.title, item.city, item.category, ...item.keywords].join(" ")
  );
  const unique = [...new Set(tokens)];
  const matches = unique.filter((token) => haystack.includes(token)).length;
  return matches / Math.max(unique.length, 1);
}

/**
 * Skelbiu.lt-style market source adapter.
 *
 * Today this is a deterministic local index that mirrors the integration contract.
 * A production adapter can replace MARKET_INDEX with scraping/API ingestion while
 * keeping the PriceAdvice UI independent from VAUTO's own listing database.
 */
export function getSkelbiuMarketSnapshot(
  target: Pick<
    Listing,
    "title" | "category" | "location" | "tags" | "description" | "attributes"
  >
): MarketPriceSnapshot {
  const city = resolveCity(target.location || "Lietuva");
  const tokens = tokensForListing(target);
  const scored = MARKET_INDEX.filter((item) => item.category === target.category)
    .map((item) => ({
      item,
      score: scoreComparable(tokens, item),
      cityMatch: item.city.toLowerCase() === city.toLowerCase(),
    }))
    .filter((entry) => entry.score >= 0.18)
    .sort((a, b) => {
      if (a.cityMatch !== b.cityMatch) return a.cityMatch ? -1 : 1;
      return b.score - a.score;
    });

  const cityMatches = scored.filter((entry) => entry.cityMatch).slice(0, 6);
  const nationalMatches = scored.slice(0, 8);
  const selected = cityMatches.length >= 2 ? cityMatches : nationalMatches;

  return {
    source: SOURCE,
    query: [...new Set(tokens)].slice(0, 8).join(" "),
    city,
    scope: cityMatches.length >= 2 ? "city" : "national",
    comparables: selected.map((entry) => entry.item),
  };
}
