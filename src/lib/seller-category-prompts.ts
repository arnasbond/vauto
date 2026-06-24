import type { ListingCategory } from "@/lib/types";

export interface SellerCategoryPrompt {
  category: ListingCategory;
  label: string;
  prompt: string;
}

/** Quick-start examples for every marketplace vertical on /add. */
export const SELLER_CATEGORY_PROMPTS: SellerCategoryPrompt[] = [
  {
    category: "vehicles",
    label: "Auto",
    prompt:
      "Parduodu BMW 320d 2018, 150000 km, pilna istorija, Vilnius, 12500 EUR",
  },
  {
    category: "electronics",
    label: "Technika",
    prompt: "Parduodu iPhone 14 Pro 256GB, puiki būklė, Kaunas, 650 EUR",
  },
  {
    category: "real_estate",
    label: "NT",
    prompt: "Nuomoju 2 kambarių butą Vilniuje, Naujamiestyje, 650 EUR per mėn",
  },
  {
    category: "clothing",
    label: "Drabužiai",
    prompt: "Parduodu Nike Air Max 42 dydis, be dėvėjimo, Klaipėda, 80 EUR",
  },
  {
    category: "home",
    label: "Namams",
    prompt: "Parduodu IKEA sofa, gera būklė, Šiauliai, 200 EUR",
  },
  {
    category: "jobs",
    label: "Darbas",
    prompt: "Ieškome sandėlininko Kaune, pilnas etatas, nuo 1200 EUR",
  },
  {
    category: "services",
    label: "Paslaugos",
    prompt: "Teikiu elektros montavimo paslaugas Vilniuje, nuo 25 EUR per val",
  },
  {
    category: "other",
    label: "Kita",
    prompt: "Parduodu vaikišką dviratį, Panevėžys, 45 EUR",
  },
];
