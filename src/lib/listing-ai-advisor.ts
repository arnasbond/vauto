import type { Listing } from "@/lib/types";
import { apiVautoServer } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import { getPriceAdvice } from "@/lib/price-advisor";

async function serverCoreV2Advice(listing: Listing): Promise<string> {
  const res = await apiVautoServer({
    action: "parse_text",
    text: `Pasiūlyk kaip pagerinti skelbimą „${listing.title}“ (${listing.price}€, ${listing.category})`,
    userCity: listing.location,
  });
  if (res && "reply" in res && typeof res.reply === "string" && res.reply.trim()) {
    return res.reply.trim();
  }
  throw new Error("Core v2 advice empty");
}

function localAdvice(listing: Listing): string {
  const priceAdvice = getPriceAdvice(listing, []);
  const tips: string[] = [];

  if (priceAdvice.verdict === "high") {
    tips.push(
      `Kaina ${listing.price} € atrodo aukštesnė už rinkos vidurkį${priceAdvice.medianPrice ? ` (~${Math.round(priceAdvice.medianPrice)} €)` : ""}. Sumažinus 5–10 % galite greičiau sulaukti skambučių.`
    );
  } else if (priceAdvice.verdict === "low") {
    tips.push(
      "Kaina žemiau rinkos — pabrėžkite aprašyme unikalias opcijas ar būklę, kad pirkėjai suprastų vertę."
    );
  }

  if (!listing.description || listing.description.length < 80) {
    tips.push("Papildykite aprašymą: būklė, komplektacija, priežastis pardavimui ir kontaktinis laikas.");
  }

  if (listing.category === "vehicles" && !listing.attributes?.vehicleOptions) {
    tips.push("Pridėkite papildomas opcijas (klimatas, navigacija, ratai) — Autoplius pirkėjai dažnai filtruoja pagal komplektaciją.");
  }

  if (listing.category === "real_estate" && !listing.attributes?.heating) {
    tips.push("Nurodykite šildymo tipą ir įrengimą — NT skelbimai su pilnais laukais gauna daugiau peržiūrų.");
  }

  if (listing.category === "jobs" && !listing.attributes?.competencies) {
    tips.push("Įvardykite reikalaujamas kompetencijas ir kalbų lygį — CVBankas kandidatai ieško tikslių kriterijų.");
  }

  if (tips.length === 0) {
    tips.push(
      "Skelbimas tvarkingas. Pabandykite atnaujinti nuotraukas arba aktyvuoti „Iškelti“ matomumą, jei per savaitę mažai skambučių."
    );
  }

  return tips.slice(0, 3).join(" ");
}

export async function adviseListingOptimization(listing: Listing): Promise<string> {
  if (isAiProxyAvailable()) {
    try {
      return await serverCoreV2Advice(listing);
    } catch {
      /* fallback */
    }
  }
  return localAdvice(listing);
}
