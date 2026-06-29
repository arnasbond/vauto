import type { Listing } from "@/lib/types";
import {
  getClientGeminiApiKey,
  isClientGeminiAvailable,
} from "@/lib/gemini-browser";
import { getPriceAdvice } from "@/lib/price-advisor";

const ADVICE_SCHEMA = `{"advice": "string — 2-3 trumpi lietuviški sakiniai, kaip pagerinti skelbimą"}`;

async function geminiAdvice(listing: Listing): Promise<string> {
  const apiKey = getClientGeminiApiKey();
  if (!apiKey) throw new Error("Gemini API key missing");

  const attrs = JSON.stringify(listing.attributes ?? {}).slice(0, 1800);
  const userPrompt = [
    "Tu esi VAUTO AI skelbimų ekspertas Lietuvoje.",
    `Pavadinimas: ${listing.title}`,
    `Kategorija: ${listing.category}`,
    `Kaina: ${listing.priceLabel ?? `${listing.price} €`}`,
    `Miestas: ${listing.location}`,
    `Aprašymas: ${(listing.description ?? "").slice(0, 500)}`,
    `Gilieji atributai: ${attrs}`,
    "Įvertink kainą, aprašymą ir atributus. Duok konkretų patarimą lietuviškai.",
    `Grąžink JSON: ${ADVICE_SCHEMA}`,
  ].join("\n");

  const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "Grąžink tik JSON." }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = JSON.parse(text) as { advice?: string };
      if (parsed.advice?.trim()) return parsed.advice.trim();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Gemini advice failed");
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
  if (isClientGeminiAvailable()) {
    try {
      return await geminiAdvice(listing);
    } catch {
      /* fallback */
    }
  }
  return localAdvice(listing);
}
