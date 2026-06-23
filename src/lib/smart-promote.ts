import type { Listing } from "@/lib/types";
import { getPromoteLabelsForCategory } from "@/lib/chameleon-themes";

export interface PromoteSuggestion {
  message: string;
  cost: number;
  durationDays: number;
  region: string;
  labels: ReturnType<typeof getPromoteLabelsForCategory>;
}

export function getPromoteSuggestion(listing: Listing): PromoteSuggestion {
  const region = listing.location.split(",")[0]?.trim() || "jūsų regione";
  const labels = getPromoteLabelsForCategory(listing.category);
  const base = listing.category === "vehicles" ? 4.99 : 2.99;
  const cost =
    listing.category === "real_estate"
      ? 9.99
      : listing.category === "services"
        ? 3.49
        : base;

  const messages: Record<string, string> = {
    vehicles: `${labels.cardCta} — daugiau peržiūrų ${region} automobilių pirkėjams`,
    clothing: `${labels.bumpLabel} — matomumas mados entuziastams ${region}`,
    services: `${labels.cardCta} — daugiau užklausų ${region}`,
    real_estate: `${labels.cardCta} — ${labels.bumpLabel} didesniam matomumui ${region}`,
    default: `${labels.cardCta} — padidinkite matomumą ${region} už ${cost.toFixed(2)}€`,
  };

  return {
    message: messages[listing.category] ?? messages.default,
    cost,
    durationDays: 7,
    region,
    labels,
  };
}
