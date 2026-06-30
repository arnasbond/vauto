import type { WardrobeDraftItem } from "@/lib/wardrobe-vision";
import { wardrobeItemToDraft } from "@/lib/wardrobe-vision";
import type { AiExtractedListing } from "@/lib/types";

export interface AgentWardrobeBulkItem {
  id: string;
  title: string;
  categoryGroup: string;
  categorySub: string;
  size: string;
  color: string;
  brand: string;
  condition: string;
  suggestedPrice: number;
  description: string;
  descriptionVariants?: WardrobeDraftItem["descriptionVariants"];
}

export function mapAgentWardrobeItems(raw: unknown): WardrobeDraftItem[] {
  if (!Array.isArray(raw)) return [];
  const out: WardrobeDraftItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const title = String(o.title ?? "").trim();
    if (!title) continue;
    out.push({
      id: String(o.id ?? `wardrobe-${out.length + 1}`),
      title,
      categoryGroup: String(o.categoryGroup ?? "Moterims"),
      categorySub: String(o.categorySub ?? "Kita"),
      size: String(o.size ?? "M"),
      color: String(o.color ?? "Mišri"),
      brand: String(o.brand ?? "Be ženklo"),
      condition: String(o.condition ?? "Labai gera"),
      suggestedPrice: Math.max(1, Number(o.suggestedPrice) || 15),
      description: String(o.description ?? title),
      descriptionVariants: o.descriptionVariants as WardrobeDraftItem["descriptionVariants"],
    });
  }
  return out.slice(0, 8);
}

export function wardrobeBulkToDrafts(
  items: WardrobeDraftItem[],
  contact: string,
  location: string
): AiExtractedListing[] {
  return items.map((item) => wardrobeItemToDraft(item, contact, location));
}
