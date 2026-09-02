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
    label: "Transportas",
    prompt:
      "Parduodu BMW 320d 2018, 150 000 km, pilna istorija, Vilnius, 12 500 €",
  },
  {
    category: "electronics",
    label: "Elektronika",
    prompt: "Parduodu iPhone 14 Pro 256GB, puiki būklė, Kaunas, 650 €",
  },
  {
    category: "real_estate",
    label: "Nekilnojamas turtas",
    prompt: "Nuomoju 2 kambarių butą Vilniuje, Naujamiestyje, 650 € per mėn",
  },
  {
    category: "services",
    label: "Paslaugos",
    prompt: "Teikiu elektros montavimo paslaugas Vilniuje, nuo 25 € per val",
  },
  {
    category: "jobs",
    label: "Darbas",
    prompt: "Ieškome sandėlininko Kaune, pilnas etatas, nuo 1 200 €",
  },
  {
    category: "home",
    label: "Namai ir buitis",
    prompt: "Parduodu IKEA sofą, gera būklė, Šiauliai, 200 €",
  },
  {
    category: "clothing",
    label: "Mada",
    prompt: "Parduodu Nike Air Max 42 dydis, be dėvėjimo, Klaipėda, 80 €",
  },
  {
    category: "other",
    label: "Kita",
    prompt: "Parduodu vaikišką dviratį, Panevėžys, 45 €",
  },
];
