import type { Listing, ListingCategory } from "@/lib/types";

const QUESTIONS: Record<ListingCategory | "default", string[]> = {
  electronics: [
    "Ar siunčiate į kitus miestus?",
    "Ar kaina galutinė?",
    "Kokia baterijos būklė?",
  ],
  vehicles: [
    "Ar galima apžiūrėti šiandien?",
    "Ar kaina galutinė?",
    "Ar yra serviso istorija?",
  ],
  services: [
    "Kada turite laisvą laiką?",
    "Ar išrašote sąskaitą faktūrą?",
    "Kiek kainuoja atvykimas?",
  ],
  home: [
    "Ar galima atsiimti šiandien?",
    "Ar kaina galutinė?",
    "Ar siunčiate?",
  ],
  clothing: [
    "Koks tikslus dydis?",
    "Ar siunčiate?",
    "Ar galima pasimatuoti?",
  ],
  real_estate: [
    "Kada galima apžiūrėti?",
    "Ar galima derėtis dėl kainos?",
    "Ar yra hipoteka?",
  ],
  other: [
    "Ar dar aktualu?",
    "Ar kaina galutinė?",
    "Ar galima susitikti šiandien?",
  ],
  default: [
    "Ar dar parduodate?",
    "Ar kaina galutinė?",
    "Ar galima susitikti?",
  ],
};

export function getQuickQuestions(listing: Listing | undefined): string[] {
  if (!listing) return QUESTIONS.default;
  return QUESTIONS[listing.category] ?? QUESTIONS.default;
}
