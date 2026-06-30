import type { AiExtractedListing } from "@/lib/types";
import { resolveEffectiveListingCategory } from "@/lib/listing-attribute-isolation";

/** Flatten category attributes into searchable tags */
export function attributesToTags(draft: AiExtractedListing): string[] {
  const tags: string[] = [];
  const attrs = draft.attributes;
  if (!attrs) return tags;

  for (const [key, value] of Object.entries(attrs)) {
    if (!value) continue;
    if (Array.isArray(value)) tags.push(...value);
    else tags.push(`${key}:${value}`);
  }

  const sk = String(attrs.skelbiuCategory ?? "").trim();
  if (sk) {
    tags.push(sk);
    if (/telefon|mobil/i.test(sk)) {
      tags.push("mobilūs telefonai", "telefonas", "mobilus telefonas", "electronics");
    }
  }

  const effective = resolveEffectiveListingCategory(draft.category, attrs);
  if (effective !== draft.category) {
    tags.push(effective);
  }

  return [...new Set(tags.filter((t) => t.trim()))];
}
