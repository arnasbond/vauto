import { unifiedLlmJson } from "./llm-provider.js";

export type BuyerPersonaId = "family" | "youth" | "rational";

export const BUYER_PERSONA_LABELS: Record<
  BuyerPersonaId,
  { title: string; subtitle: string }
> = {
  family: {
    title: "Šeimai / Saugumui",
    subtitle: "Erdvė, patogumas, saugumas, praktiškumas",
  },
  youth: {
    title: "Jaunimui / Dinamikai",
    subtitle: "Išvaizda, emocija, stilius, trauka",
  },
  rational: {
    title: "Racionaliam pirkėjui",
    subtitle: "Ekonomija, išlaikymas, likutinė vertė",
  },
};

const PERSONA_SCHEMA = `{
  "family": "string — aprašymas šeimai: erdvė, saugumas, praktiškumas (4–6 sakiniai, lietuviškai)",
  "youth": "string — aprašymas jaunimui: stilius, emocija, dinamika (4–6 sakiniai)",
  "rational": "string — aprašymas racionaliam pirkėjui: ekonomija, vertė, išlaikymas (4–6 sakiniai)"
}`;

export interface DescriptionPersonaInput {
  title: string;
  category: string;
  price?: number;
  location?: string;
  attributes?: Record<string, string | string[]>;
  baseDescription?: string;
}

export interface DescriptionPersonaVariants {
  family: string;
  youth: string;
  rational: string;
}

function formatAttributes(attrs?: Record<string, string | string[]>): string {
  if (!attrs) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("_")) continue;
    const val = Array.isArray(v) ? v.join(", ") : String(v);
    if (val.trim()) parts.push(`${k}: ${val}`);
  }
  return parts.length ? `\nTechniniai laukai: ${parts.join("; ")}` : "";
}

/** AI Chameleon — 3 pirkėjo personos aprašymų variantai. */
export async function generateBuyerPersonaDescriptions(
  input: DescriptionPersonaInput
): Promise<DescriptionPersonaVariants> {
  const systemInstruction = `Tu esi VAUTO AI Chameleon — skelbimų copywriteris lietuviškai.
Sugeneruok 3 SKIRTINGUS to paties skelbimo aprašymus pagal pirkėjo tipą — ne kopijuok tą patį tekstą.
Grąžink tik JSON: ${PERSONA_SCHEMA}`;

  const userPrompt = `Skelbimas: „${input.title}"
Kategorija: ${input.category}
Kaina: ${input.price && input.price > 0 ? `${input.price} EUR` : "nenurodyta"}
Vieta: ${input.location ?? "Lietuva"}${formatAttributes(input.attributes)}
${input.baseDescription?.trim() ? `Bazinis aprašymas (naudok faktus): ${input.baseDescription.trim()}` : ""}

family — akcentuok erdvę, saugumą, patogumą, praktiškumą (šeimai).
youth — akcentuok išvaizdą, emociją, stilių, trauką (jaunimui).
rational — akcentuok ekonomiją, išlaikymą, likutinę vertę, logišką pirkimą.`;

  const raw = await unifiedLlmJson({ prompt: userPrompt, systemInstruction });
  const fallback = input.baseDescription?.trim() || input.title;

  return {
    family: String(raw.family ?? fallback).trim() || fallback,
    youth: String(raw.youth ?? fallback).trim() || fallback,
    rational: String(raw.rational ?? fallback).trim() || fallback,
  };
}
