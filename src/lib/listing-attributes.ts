import type { AiExtractedListing, ListingCategory } from "@/lib/types";
import { resolveEffectiveListingCategory } from "@/lib/listing-attribute-isolation";
import { readClientDraftId } from "@/lib/listing-draft-id";

/** Internal attribute keys — never shown as public listing tags. */
export const INTERNAL_LISTING_ATTR_KEYS = new Set([
  "profileContactSynced",
  "sellerId",
  "clientDraftId",
  "phone",
  "contact",
  "contactName",
  "email",
  "sellerName",
  "sellername",
  "sellerDisplayName",
  "location",
  "fashionCategory",
  "fashionSubcategory",
  "clothingType",
  "skelbiuCategory",
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
  "socialPublishAnonserLt",
  "socialPublishAiAdaptation",
  "socialPublishFacebookGroups",
  "conductorSources",
  "conductorMergedAt",
]);

/** Keys whose `key:value` tags may surface as the bare value only. */
const PUBLIC_VALUE_TAG_KEYS = new Set([
  "brand",
  "condition",
  "manufacturer",
  "deviceModel",
  "size",
  "color",
  "colors",
]);

function isInternalTag(tag: string): boolean {
  const t = tag.trim();
  if (!t) return true;
  const colon = t.indexOf(":");
  if (colon > 0) {
    const key = t.slice(0, colon).trim();
    if (INTERNAL_LISTING_ATTR_KEYS.has(key)) return true;
    // Hide any leftover CRM/contact dumps (contact:+370…, email:…, sellerName:…).
    if (/^(contact|email|sellername|phone|location|fashioncategory)$/i.test(key)) {
      return true;
    }
  }
  if (INTERNAL_LISTING_ATTR_KEYS.has(t)) return true;
  if (/^(true|false)$/i.test(t) && t.length <= 5) return false;
  return false;
}

/** Turn `brand:Peiko` into `Peiko`; drop opaque system dumps. */
function toPublicTagLabel(
  tag: string,
  category?: ListingCategory
): string | null {
  const t = tag.trim();
  if (!t || isInternalTag(t)) return null;

  const colon = t.indexOf(":");
  if (colon > 0) {
    const key = t.slice(0, colon).trim();
    const value = t.slice(colon + 1).trim();
    if (!value) return null;
    if (INTERNAL_LISTING_ATTR_KEYS.has(key)) return null;
    // Size is fashion-only — never surface on electronics/auto/etc.
    if (key === "size" && category && category !== "clothing") return null;
    if (PUBLIC_VALUE_TAG_KEYS.has(key)) return value;
    // Unknown key:value pairs stay hidden — they are almost always internal.
    return null;
  }

  // Strip stray markdown heading markers from free-form tags.
  const cleaned = t.replace(/^#{1,6}\s*/, "").trim();
  if (!cleaned) return null;
  if (/^#{1,6}$/.test(cleaned)) return null;
  // Bare clothing sizes without context look like artifacts on non-fashion.
  if (
    category &&
    category !== "clothing" &&
    /^(xxs|xs|s|m|l|xl|xxl|\d{2,3})$/i.test(cleaned)
  ) {
    return null;
  }
  return cleaned;
}

/** Tags safe to show on public listing detail pages. */
export function filterPublicListingTags(
  tags: string[],
  category?: ListingCategory
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const label = toPublicTagLabel(raw, category);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
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

  return filterPublicListingTags(tags, effective);
}
