import { unifiedLlmJson } from "../ai/llm-provider.js";
import type { BarcodeLookupResult } from "./product-lookup-types.js";

export interface FashionListingCopy {
  title: string;
  description: string;
  confidence: number;
}

const FASHION_SYSTEM =
  "Tu esi mados ir antrosios rankos prekių platformos (Vinted stiliaus) copywriteris lietuviškai. Grąžink tik JSON.";

export async function generateFashionListingCopy(
  product: BarcodeLookupResult,
  opts?: { category?: string; hint?: string }
): Promise<FashionListingCopy> {
  const isCosmetics =
    product.source === "open-beauty-facts" ||
    /kosmet|kvepal|beauty|parfum|makeup/i.test(product.category ?? "");

  const prompt = `Sugeneruok patrauklų pardavimo skelbimą lietuviškai pagal TIK šiuos gamyklinius duomenis (neišgalvok faktų).

Produkto duomenys:
${JSON.stringify(product, null, 2)}

Kontekstas: ${opts?.category ?? "clothing"} — ${isCosmetics ? "kosmetika / kvepalai" : "drabužiai / avalynė / aksesuarai"}.
${opts?.hint ? `Papildoma užuomina: ${opts.hint}` : ""}

Reikalavimai:
- title: trumpa, stilinga antraštė (prekės ženklas + modelis/pavadinimas)
- description: 4–7 sakiniai, šiltas ir patikimas tonas kaip Vinted, be emoji, pabrėžk būklę jei nežinoma — neutraliai
- Jei duomenų trūksta — neįvardink nežinomų detalių
- confidence: 0.0–1.0

Grąžink JSON: { "title": "string", "description": "string", "confidence": number }`;

  const raw = await unifiedLlmJson({
    prompt,
    systemInstruction: FASHION_SYSTEM,
  });

  const title = String(raw.title ?? "").trim();
  const description = String(raw.description ?? "").trim();
  if (!title || !description) {
    throw new Error("Empty fashion copy from Gemini");
  }

  return {
    title,
    description,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.85)),
  };
}
