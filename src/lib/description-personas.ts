import { apiGenerateDescriptionPersonas } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";
import type { AiExtractedListing } from "@/lib/types";

export type BuyerPersonaId = "family" | "youth" | "rational";

export interface BuyerPersonaVariants {
  family?: string;
  youth?: string;
  rational?: string;
}

export const BUYER_PERSONA_CARDS: Array<{
  id: BuyerPersonaId;
  title: string;
  subtitle: string;
  accent: string;
}> = [
  {
    id: "family",
    title: "Šeimai / Saugumui",
    subtitle: "Erdvė, patogumas, saugumas",
    accent: "#2e7d32",
  },
  {
    id: "youth",
    title: "Jaunimui / Dinamikai",
    subtitle: "Stilius, emocija, trauka",
    accent: "#1565c0",
  },
  {
    id: "rational",
    title: "Racionaliam pirkėjui",
    subtitle: "Ekonomija, vertė, išlaikymas",
    accent: "#6a1b9a",
  },
];

export function personaText(
  variants: BuyerPersonaVariants | undefined,
  id: BuyerPersonaId
): string {
  if (!variants) return "";
  return variants[id]?.trim() ?? "";
}

export async function fetchBuyerPersonaDescriptions(
  draft: AiExtractedListing
): Promise<BuyerPersonaVariants | null> {
  if (!isAiProxyAvailable()) return null;
  const attrs = draft.attributes ?? {};
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    flat[k] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
  }
  return apiGenerateDescriptionPersonas({
    title: draft.title,
    category: draft.category,
    price: draft.price,
    location: draft.location,
    attributes: flat,
    baseDescription: draft.description,
  });
}
