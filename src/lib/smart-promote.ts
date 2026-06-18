import type { Listing } from "@/lib/types";

export interface PromoteSuggestion {
  message: string;
  cost: number;
  durationDays: number;
  region: string;
}

export function getPromoteSuggestion(listing: Listing): PromoteSuggestion {
  const region = listing.location.split(",")[0]?.trim() || "jūsų regione";
  const base = listing.category === "vehicles" ? 4.99 : 2.99;
  const cost =
    listing.category === "real_estate"
      ? 9.99
      : listing.category === "services"
        ? 3.49
        : base;

  const messages: Record<string, string> = {
    vehicles: `AI patarimas: Padidinkite peržiūras ${region} automobilių pirkėjams`,
    services: `AI patarimas: Išskirkite paslaugą ${region} — daugiau užklausų`,
    real_estate: `AI patarimas: Prioritetas NT paieškoje ${region}`,
    clothing: `AI patarimas: Boost peržiūros ${region} mados entuziastams`,
    default: `AI patarimas: Padidinkite peržiūras ${region} už ${cost.toFixed(2)}€`,
  };

  return {
    message: messages[listing.category] ?? messages.default,
    cost,
    durationDays: 7,
    region,
  };
}
