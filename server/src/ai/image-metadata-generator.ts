import { unifiedLlmJson } from "./llm-provider.js";

export interface VisualSeoMetadata {
  alt: string;
  title: string;
  description?: string;
}

const CATEGORY_LT: Record<string, string> = {
  vehicles: "automobilis",
  real_estate: "nekilnojamasis turtas",
  electronics: "elektronika",
  clothing: "drabužiai",
  services: "paslaugos",
  jobs: "darbas",
  home: "namų prekės",
  other: "prekė",
};

function fallbackSeo(input: {
  listingTitle: string;
  category: string;
  city: string;
}): VisualSeoMetadata {
  const type = CATEGORY_LT[input.category] ?? "skelbimas";
  const city = input.city.trim() || "Lietuva";
  const title = input.listingTitle.trim() || "VAUTO skelbimas";
  return {
    alt: `${title} — ${type} pardavimui ${city} | VAUTO`,
    title: `${title} | ${type} ${city} — VAUTO skelbimai`,
    description: `Peržiūrėkite ${type} „${title}“ ${city}. Originalios nuotraukos VAUTO platformoje.`,
  };
}

/**
 * Visual SEO Generator — lietuviški alt/title atributai Google Images optimizacijai.
 */
export async function generateImageMetadata(input: {
  listingTitle: string;
  category: string;
  city: string;
  attributes?: Record<string, unknown>;
  imageDataUrl?: string;
}): Promise<VisualSeoMetadata> {
  const fallback = fallbackSeo(input);
  const city = input.city.trim() || "Lietuva";
  const category = input.category || "other";
  const attrs = input.attributes ?? {};

  try {
    const raw = await unifiedLlmJson({
      systemInstruction: `Tu esi VAUTO Visual SEO specialistas Lietuvoje.
Grąžink JSON: {"alt":"string","title":"string","description":"string"}
alt — iki 125 simbolių, lietuviškai, su miestu ir prekės tipu (Google Images).
title — iki 70 simbolių, patrauklus lietuviškas pavadinimas su lokacija.
description — 1–2 sakiniai lietuviškai SEO aprašymui.
Nenaudok angliškų placeholderių. Įtrauk VAUTO prekės ženklą natūraliai.`,
      prompt: `Skelbimas: ${input.listingTitle}
Kategorija: ${category}
Miestas: ${city}
Atributai: ${JSON.stringify(attrs).slice(0, 400)}`,
      imageDataUrls: input.imageDataUrl ? [input.imageDataUrl] : undefined,
    });

    const alt = String(raw.alt ?? fallback.alt).trim().slice(0, 125);
    const title = String(raw.title ?? fallback.title).trim().slice(0, 70);
    const description = String(raw.description ?? fallback.description ?? "").trim();

    if (alt.length < 8) return fallback;

    return { alt, title: title || fallback.title, description: description || fallback.description };
  } catch {
    return fallback;
  }
}
