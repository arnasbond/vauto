import {
  ADAPTIVE_CATEGORIES,
  getAdaptiveConfig,
  listingToAdaptiveKey,
  type AdaptiveCategoryKey,
  type CategoryFieldDef,
} from "@/lib/adaptive-categories";
import type { CategoryAttributes, ListingCategory } from "@/lib/types";

/** Keys preserved across category switches (seller identity, geo, publish). */
const GLOBAL_ATTRIBUTE_KEYS = new Set([
  "sellerType",
  "companyName",
  "_geoLat",
  "_geoLng",
  "socialPublish",
  "socialPublishFacebook",
  "socialPublishInstagram",
  "fashionCategory",
  "skelbiuCategory",
]);

/** Alias keys used by resolveFieldValue — keep when parent exists. */
const ATTRIBUTE_ALIASES: Record<string, string[]> = {
  furnishing: ["condition", "irengimas"],
  heating: ["heatingType"],
};

function schemaKeysForAdaptiveKey(key: AdaptiveCategoryKey): Set<string> {
  return new Set(getAdaptiveConfig(key).fields.map((f) => f.key));
}

export function allForeignSchemaKeys(currentKey: import("@/lib/adaptive-categories").AdaptiveCategoryKey): Set<string> {
  const foreign = new Set<string>();
  for (const cfg of Object.values(ADAPTIVE_CATEGORIES)) {
    if (cfg.key === currentKey) continue;
    for (const field of cfg.fields) foreign.add(field.key);
  }
  return foreign;
}

export function allowedAttributeKeysForCategory(category: ListingCategory): Set<string> {
  const adaptiveKey = listingToAdaptiveKey(category);
  const allowed = schemaKeysForAdaptiveKey(adaptiveKey);
  for (const key of GLOBAL_ATTRIBUTE_KEYS) allowed.add(key);
  for (const [canonical, aliases] of Object.entries(ATTRIBUTE_ALIASES)) {
    if (allowed.has(canonical)) {
      for (const alias of aliases) allowed.add(alias);
    }
  }
  return allowed;
}

/**
 * Hard reset: drop attributes from other verticals when category/adaptive key changes.
 * Merges optional incoming patch after filtering to the target category schema.
 */
export function sanitizeAttributesForCategory(
  category: ListingCategory,
  attributes: CategoryAttributes = {},
  incoming?: CategoryAttributes
): CategoryAttributes {
  const adaptiveKey = listingToAdaptiveKey(category);
  const allowed = allowedAttributeKeysForCategory(category);
  const foreign = allForeignSchemaKeys(adaptiveKey);
  const merged = { ...attributes, ...incoming };
  const out: CategoryAttributes = {};

  for (const [key, value] of Object.entries(merged)) {
    if (foreign.has(key) && !allowed.has(key)) continue;
    if (!allowed.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (!Array.isArray(value) && String(value).trim() === "") continue;
    out[key] = value;
  }
  return out;
}

export function adaptiveVerticalChanged(
  prevCategory: ListingCategory | null | undefined,
  nextCategory: ListingCategory
): boolean {
  if (!prevCategory) return false;
  return listingToAdaptiveKey(prevCategory) !== listingToAdaptiveKey(nextCategory);
}

const UNIVERSAL_ELECTRONICS_KEYS = new Set([
  "skelbiuCategory",
  "manufacturer",
  "deviceModel",
  "storageCapacity",
  "deviceOs",
  "warranty",
  "condition",
]);

const UNIVERSAL_FURNITURE_KEYS = new Set([
  "skelbiuCategory",
  "furnitureType",
  "material",
  "condition",
]);

const UNIVERSAL_TOOLS_KEYS = new Set([
  "skelbiuCategory",
  "toolType",
  "powerSource",
  "condition",
]);

/** Universal schema packs all verticals — show only fields matching skelbiuCategory. */
export function filterFieldsForListingCategory(
  category: ListingCategory,
  attributes: CategoryAttributes,
  fields: CategoryFieldDef[]
): CategoryFieldDef[] {
  if (listingToAdaptiveKey(category) !== "universal") return fields;

  const sk = String(attributes.skelbiuCategory ?? "").toLowerCase();

  if (/elektron|telefon|kompiuter|planšet|planset|iphone|android|televiz/.test(sk)) {
    return fields.filter((f) => UNIVERSAL_ELECTRONICS_KEYS.has(f.key));
  }
  if (/bald|sofa|lov|stal|spint|kėd|ked|interjer/.test(sk)) {
    return fields.filter((f) => UNIVERSAL_FURNITURE_KEYS.has(f.key));
  }
  if (/įrank|irank|statyb|sodo|technik|medžiag/.test(sk)) {
    return fields.filter((f) => UNIVERSAL_TOOLS_KEYS.has(f.key));
  }

  return fields.filter((f) => f.key === "skelbiuCategory" || f.key === "condition");
}

export function finalizeListingDraft(
  draft: import("@/lib/types").AiExtractedListing,
  previousCategory?: ListingCategory | null
): import("@/lib/types").AiExtractedListing {
  const hardReset = adaptiveVerticalChanged(previousCategory, draft.category);
  const baseAttrs = hardReset ? {} : (draft.attributes ?? {});
  return {
    ...draft,
    attributes: sanitizeAttributesForCategory(draft.category, baseAttrs, draft.attributes),
  };
}
