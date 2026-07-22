import {
  ADAPTIVE_CATEGORIES,
  getAdaptiveConfig,
  listingToAdaptiveKey,
  type AdaptiveCategoryKey,
  type CategoryFieldDef,
} from "@/lib/adaptive-categories";
import type { AiExtractedListing, CategoryAttributes, ListingCategory } from "@/lib/types";

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

export function allForeignSchemaKeys(currentKey: import("@/lib/adaptive-categories").AdaptiveCategoryKey): Set<string> {
  const foreign = new Set<string>();
  for (const cfg of Object.values(ADAPTIVE_CATEGORIES)) {
    if (cfg.key === currentKey) continue;
    for (const field of cfg.fields) foreign.add(field.key);
  }
  return foreign;
}

/**
 * When JSON still says vehicles but skelbiuCategory / picker already moved to phones etc.,
 * validation and sanitization must follow the effective universal path — not stale vehicle schema.
 */
export function resolveEffectiveListingCategory(
  category: ListingCategory,
  attributes: CategoryAttributes = {}
): ListingCategory {
  const sk = String(attributes.skelbiuCategory ?? "").toLowerCase();
  if (/elektron|telefon|mobil|kompiuter|planšet|planset|iphone|android|samsung|televiz/.test(sk)) {
    return "electronics";
  }
  if (/bald|sofa|lov|stal|spint|kėd|ked|interjer/.test(sk)) {
    return "home";
  }
  if (listingToAdaptiveKey(category) !== "vehicles") return category;
  if (/įrank|irank|statyb|sodo|technik|medžiag/.test(sk)) {
    return "other";
  }
  return category;
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

function resolveUniversalSubVerticalKeys(attributes: CategoryAttributes): Set<string> {
  const sk = String(attributes.skelbiuCategory ?? "").toLowerCase();

  if (/elektron|telefon|kompiuter|planšet|planset|iphone|android|televiz/.test(sk)) {
    return new Set(UNIVERSAL_ELECTRONICS_KEYS);
  }
  if (/bald|sofa|lov|stal|spint|kėd|ked|interjer/.test(sk)) {
    return new Set(UNIVERSAL_FURNITURE_KEYS);
  }
  if (/įrank|irank|statyb|sodo|technik|medžiag/.test(sk)) {
    return new Set(UNIVERSAL_TOOLS_KEYS);
  }

  return new Set(["skelbiuCategory", "condition"]);
}

/** Active schema keys for the current category + universal sub-vertical (not the full packed schema). */
export function activeAttributeKeysForListing(
  category: ListingCategory,
  attributes: CategoryAttributes = {}
): Set<string> {
  const adaptiveKey = listingToAdaptiveKey(category);
  const allowed =
    adaptiveKey === "universal"
      ? resolveUniversalSubVerticalKeys(attributes)
      : schemaKeysForAdaptiveKey(adaptiveKey);

  for (const key of GLOBAL_ATTRIBUTE_KEYS) allowed.add(key);
  allowed.add("_geoLat");
  allowed.add("_geoLng");

  for (const [canonical, aliases] of Object.entries(ATTRIBUTE_ALIASES)) {
    if (allowed.has(canonical)) {
      for (const alias of aliases) allowed.add(alias);
    }
  }
  return allowed;
}

export function universalSubVerticalChanged(
  prev: CategoryAttributes | null | undefined,
  next: CategoryAttributes | null | undefined
): boolean {
  const prevSk = String(prev?.skelbiuCategory ?? "").trim().toLowerCase();
  const nextSk = String(next?.skelbiuCategory ?? "").trim().toLowerCase();
  if (!prevSk || !nextSk) return false;
  return prevSk !== nextSk;
}

/** Foreign attribute keys still present in JSON but outside the active field basket. */
export function findStaleForeignAttributes(
  category: ListingCategory,
  attributes: CategoryAttributes = {}
): Array<{ key: string; sourceVertical: AdaptiveCategoryKey }> {
  const validationCategory = resolveEffectiveListingCategory(category, attributes);
  const adaptiveKey = listingToAdaptiveKey(validationCategory);
  const allowed = activeAttributeKeysForListing(validationCategory, attributes);
  const stale: Array<{ key: string; sourceVertical: AdaptiveCategoryKey }> = [];

  for (const [key, value] of Object.entries(attributes)) {
    if (allowed.has(key) || key.startsWith("_")) continue;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (!Array.isArray(value) && String(value).trim() === "") continue;

    for (const cfg of Object.values(ADAPTIVE_CATEGORIES)) {
      if (cfg.key === adaptiveKey) continue;
      if (cfg.fields.some((field) => field.key === key)) {
        stale.push({ key, sourceVertical: cfg.key });
        break;
      }
    }
  }
  return stale;
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
  const merged = { ...attributes, ...incoming };
  const adaptiveKey = listingToAdaptiveKey(category);
  const allowed = activeAttributeKeysForListing(category, merged);
  const foreign = allForeignSchemaKeys(adaptiveKey);
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

/**
 * Photo re-upload conflict detector — DISABLED.
 * Domain autonomy: Vision category wins; never roll back / hard-block publish.
 */
export function detectSellerPhotoCategoryConflict(
  previousCategory?: ListingCategory | null,
  previousAttributes?: CategoryAttributes | null,
  finalized?: AiExtractedListing
): boolean {
  void previousCategory;
  void previousAttributes;
  void finalized;
  return false;
}

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
  draft: AiExtractedListing,
  previousCategory?: ListingCategory | null,
  previousAttributes?: CategoryAttributes | null
): AiExtractedListing {
  const effectiveCategory = resolveEffectiveListingCategory(
    draft.category,
    draft.attributes ?? {}
  );
  const hardReset =
    adaptiveVerticalChanged(previousCategory, effectiveCategory) ||
    adaptiveVerticalChanged(previousCategory, draft.category) ||
    (listingToAdaptiveKey(effectiveCategory) === "universal" &&
      universalSubVerticalChanged(previousAttributes, draft.attributes));
  const baseAttrs = hardReset ? {} : (draft.attributes ?? {});
  return {
    ...draft,
    category: effectiveCategory,
    attributes: sanitizeAttributesForCategory(effectiveCategory, baseAttrs, draft.attributes),
  };
}
