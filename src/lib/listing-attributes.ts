import type { AiExtractedListing } from "@/lib/types";

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
  return tags;
}
