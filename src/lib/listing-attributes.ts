import type { AiExtractedListing } from "@/lib/types";
import { resolveEffectiveListingCategory } from "@/lib/listing-attribute-isolation";
import { readClientDraftId } from "@/lib/listing-draft-id";

/** Internal attribute keys — never shown as public listing tags. */
export const INTERNAL_LISTING_ATTR_KEYS = new Set([
  "profileContactSynced",
  "sellerId",
  "clientDraftId",
  "phone",
  "contactName",
  "isAiTwinActive",
  "_visibilityTier",
  "geoLat",
  "geoLng",
  "geolat",
  "geolng",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "coords",
  "coordinates",
  "socialPublish",
  "socialPublishFacebook",
  "socialPublishInstagram",
]);

function isInternalTag(tag: string): boolean {
  const t = tag.trim();
  if (!t) return true;
  const colon = t.indexOf(":");
  if (colon > 0) {
    const key = t.slice(0, colon).trim();
    if (INTERNAL_LISTING_ATTR_KEYS.has(key)) return true;
  }
  if (INTERNAL_LISTING_ATTR_KEYS.has(t)) return true;
  if (/^(true|false)$/i.test(t) && t.length <= 5) return false;
  return false;
}

/** Tags safe to show on public listing detail pages. */
export function filterPublicListingTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t && !isInternalTag(t)))];
}

/** Flatten category attributes into searchable tags */
export function attributesToTags(draft: AiExtractedListing): string[] {
  const tags: string[] = [];
  const attrs = draft.attributes;
  if (!attrs) return tags;

  for (const [key, value] of Object.entries(attrs)) {
    if (!value || INTERNAL_LISTING_ATTR_KEYS.has(key)) continue;
    if (Array.isArray(value)) tags.push(...value.filter(Boolean).map(String));
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

  const clientId = readClientDraftId(attrs);
  if (clientId) {
    /* clientDraftId used for idempotency only — excluded from tags above */
  }

  return filterPublicListingTags(tags);
}
