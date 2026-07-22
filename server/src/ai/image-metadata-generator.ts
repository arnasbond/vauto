import { unifiedLlmJson } from "./llm-provider.js";
import { VISION_ANTI_HALLUCINATION_RULE } from "./vision-guardrails.js";

export interface VisualSeoMetadata {
  alt: string;
  title: string;
  description?: string;
}

export class ImageMetadataRejectedError extends Error {
  constructor(message = "Prekė neatpažinta") {
    super(message);
    this.name = "ImageMetadataRejectedError";
  }
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

const SINGLE_LISTING_VISION_RULE = `
VIENAS SKELBIMAS — PRIVALOMA:
- Analizuok tik PAGRINDINĮ objektą nuotraukoje (didžiausias, centrinis, aiškiausias).
- Jei matomas automobilis — generuok metadata TIK automobiliui. Jei rūbas — TIK rūbui. Jei elektronika — TIK jai.
- NEGENERUOK kelių skelbimų, variantų ar sąrašų. Grąžink tik vieną alt/title/description rinkinį.
- Jei nuotraukoje keli objektai — pasirink tik vieną pagrindinį; nekurk atskirų variantų.
- Jei prekės nėra ar objektas neaiškus — grąžink {"alt":"","title":"","description":"","error":"Prekė neatpažinta"}.
- GRIEŽTAI draudžiama haliucinuoti netikrus drabužius, sukneles ar kitas prekes.`;

/**
 * Visual SEO Generator — lietuviški alt/title atributai Google Images optimizacijai.
 * Tik VIENAM pagrindiniam skelbimo objektui.
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

  if (!input.imageDataUrl?.trim()) {
    return fallback;
  }

  try {
    const raw = await unifiedLlmJson({
      systemInstruction: `Tu esi VAUTO Visual SEO specialistas Lietuvoje.
Grąžink JSON: {"alt":"string","title":"string","description":"string","error":"string optional"}
alt — iki 125 simbolių, lietuviškai, su miestu ir prekės tipu (Google Images).
title — iki 70 simbolių, patrauklus lietuviškas pavadinimas su lokacija.
description — 1–2 sakiniai lietuviškai SEO aprašymui VIENAM objektui.
Nenaudok angliškų placeholderių. Įtrauk VAUTO prekės ženklą natūraliai.
${VISION_ANTI_HALLUCINATION_RULE}
${SINGLE_LISTING_VISION_RULE}`,
      prompt: `Skelbimas: ${input.listingTitle}
Kategorija: ${category}
Miestas: ${city}
Atributai: ${JSON.stringify(attrs).slice(0, 400)}
Sugeneruok SEO metadata tik šiam vienam pagrindiniam objektui.`,
      imageDataUrls: [input.imageDataUrl],
    });

    const alt = String(raw.alt ?? "").trim().slice(0, 125);
    const title = String(raw.title ?? "").trim().slice(0, 70);
    const description = String(raw.description ?? "").trim();

    // Never reject the listing pipeline for weak SEO metadata — fall back.
    return {
      alt: alt || fallback.alt,
      title: title || fallback.title,
      description: description || fallback.description,
    };
  } catch {
    return fallback;
  }
}
