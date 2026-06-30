import type { CategoryAttributes, ListingCategory } from "@/lib/types";
import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories/types";
import { getAdaptiveConfig } from "@/lib/adaptive-categories/config";
import {
  filterFieldsForListingCategory,
  findStaleForeignAttributes,
} from "@/lib/listing-attribute-isolation";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories/types";

export const LAND_PROPERTY_TYPES = new Set([
  "sklypas",
  "zemes_sklypas",
  "misko_sklypas",
]);

function isEmpty(value: string | string[] | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

export function resolveFieldValue(
  key: string,
  attributes: CategoryAttributes = {}
): string | string[] | undefined {
  if (key === "furnishing") {
    return attributes.furnishing ?? attributes.condition ?? attributes.irengimas;
  }
  if (key === "heating") {
    return attributes.heating ?? attributes.heatingType;
  }
  return attributes[key];
}

export function isCriticalFieldRequired(
  adaptiveKey: AdaptiveCategoryKey,
  fieldKey: string,
  attributes: CategoryAttributes = {}
): boolean {
  const config = getAdaptiveConfig(adaptiveKey);
  const field = config.fields.find((f) => f.key === fieldKey);
  if (!field?.critical) return false;

  const propertyType = String(attributes.propertyType ?? "");

  if (
    fieldKey === "furnishing" &&
    LAND_PROPERTY_TYPES.has(propertyType)
  ) {
    return false;
  }

  if (
    fieldKey === "rooms" &&
    LAND_PROPERTY_TYPES.has(propertyType)
  ) {
    return false;
  }

  if (
    fieldKey === "heating" &&
    LAND_PROPERTY_TYPES.has(propertyType)
  ) {
    return false;
  }

  return true;
}

export function isFieldMissing(
  key: string,
  attributes: CategoryAttributes = {}
): boolean {
  return isEmpty(resolveFieldValue(key, attributes));
}

export function getMissingCriticalFields(
  adaptiveKey: AdaptiveCategoryKey,
  attributes: CategoryAttributes = {},
  extras?: { price?: number; description?: string }
): string[] {
  const config = getAdaptiveConfig(adaptiveKey);
  const missing: string[] = [];

  if (extras?.price !== undefined && extras.price <= 0) missing.push("price");

  for (const field of config.fields) {
    if (!isCriticalFieldRequired(adaptiveKey, field.key, attributes)) continue;
    if (isFieldMissing(field.key, attributes)) missing.push(field.key);
  }

  if (
    adaptiveKey === "universal" &&
    config.baseFields.includes("description") &&
    isEmpty(extras?.description)
  ) {
    missing.push("description");
  }

  return missing;
}

/** Validate only fields visible/active for the listing's current category path. */
export function getMissingCriticalFieldsForListing(
  category: ListingCategory,
  attributes: CategoryAttributes = {},
  extras?: { price?: number; description?: string }
): string[] {
  const adaptiveKey = listingToAdaptiveKey(category);
  const config = getAdaptiveConfig(adaptiveKey);
  const activeFields = filterFieldsForListingCategory(category, attributes, config.fields);
  const missing: string[] = [];

  if (extras?.price !== undefined && extras.price <= 0) missing.push("price");

  for (const field of activeFields) {
    if (!isCriticalFieldRequired(adaptiveKey, field.key, attributes)) continue;
    if (isFieldMissing(field.key, attributes)) missing.push(field.key);
  }

  if (
    adaptiveKey === "universal" &&
    config.baseFields.includes("description") &&
    isEmpty(extras?.description)
  ) {
    missing.push("description");
  }

  return missing;
}

export interface ListingPublishValidation {
  missingKeys: string[];
  staleKeys: Array<{ key: string; sourceVertical: AdaptiveCategoryKey; label: string }>;
  needsPrice: boolean;
  needsPhoto: boolean;
  needsSellerType: boolean;
  needsTitle: boolean;
  canPublish: boolean;
  blockMessage: string;
}

export function buildPublishBlockMessage(params: {
  adaptiveKey: AdaptiveCategoryKey;
  missingKeys: string[];
  staleKeys: Array<{ key: string; sourceVertical: AdaptiveCategoryKey; label: string }>;
  needsPrice: boolean;
  needsPhoto: boolean;
  needsSellerType: boolean;
  needsTitle: boolean;
}): string {
  const parts: string[] = [];

  if (params.needsPhoto) parts.push("Pridėkite nuotrauką");
  if (params.needsTitle) parts.push("Įveskite pavadinimą (min. 2 simboliai)");
  if (params.needsPrice || params.missingKeys.includes("price")) parts.push("Įveskite kainą");
  if (params.needsSellerType) parts.push("Pasirinkite: privatus ar įmonė");

  for (const key of params.missingKeys) {
    if (key === "price" || key === "description") continue;
    parts.push(`Trūksta: ${getFieldLabel(params.adaptiveKey, key)}`);
  }
  if (params.missingKeys.includes("description")) {
    parts.push("Trūksta: Aprašymas");
  }

  for (const stale of params.staleKeys.slice(0, 2)) {
    parts.push(`Nematoma klaida: ${stale.sourceVertical}.${stale.key}`);
  }

  if (parts.length === 0) return "Užpildykite privalomus laukus";
  return parts.slice(0, 4).join(" · ");
}

export function evaluateListingPublishValidation(
  category: ListingCategory,
  draft: {
    title: string;
    price: number;
    description?: string;
    attributes?: CategoryAttributes;
  },
  opts: { hasPhoto: boolean }
): ListingPublishValidation {
  const adaptiveKey = listingToAdaptiveKey(category);
  const attributes = draft.attributes ?? {};
  const missingKeys = getMissingCriticalFieldsForListing(category, attributes, {
    price: draft.price,
    description: draft.description,
  });
  const staleRaw = findStaleForeignAttributes(category, attributes);
  const staleKeys = staleRaw.map((item) => ({
    ...item,
    label: getFieldLabel(item.sourceVertical, item.key),
  }));

  const needsPrice = draft.price <= 0;
  const needsPhoto = !opts.hasPhoto;
  const needsSellerType = !String(attributes.sellerType ?? "").trim();
  const needsTitle = draft.title.trim().length < 2;
  const canPublish =
    missingKeys.length === 0 &&
    staleKeys.length === 0 &&
    !needsPrice &&
    !needsTitle &&
    !needsPhoto &&
    !needsSellerType;

  const blockMessage = buildPublishBlockMessage({
    adaptiveKey,
    missingKeys,
    staleKeys,
    needsPrice,
    needsPhoto,
    needsSellerType,
    needsTitle,
  });

  return {
    missingKeys,
    staleKeys,
    needsPrice,
    needsPhoto,
    needsSellerType,
    needsTitle,
    canPublish,
    blockMessage,
  };
}

export function getFieldLabel(
  adaptiveKey: AdaptiveCategoryKey,
  fieldKey: string
): string {
  const config = getAdaptiveConfig(adaptiveKey);
  return config.fields.find((f) => f.key === fieldKey)?.label ?? fieldKey;
}

/** Keys missing on a specific vehicle wizard step (for red highlight). */
export function getVehicleStepMissingKeys(
  step: number,
  attributes: CategoryAttributes
): string[] {
  const keys: string[] = [];
  if (step === 1) {
    if (isFieldMissing("make", attributes)) keys.push("make");
    if (isFieldMissing("model", attributes)) keys.push("model");
    if (isFieldMissing("year", attributes)) keys.push("year");
  }
  if (step === 3) {
    if (isFieldMissing("bodyType", attributes)) keys.push("bodyType");
    if (isFieldMissing("fuelType", attributes)) keys.push("fuelType");
    if (isFieldMissing("gearbox", attributes)) keys.push("gearbox");
    if (isFieldMissing("doors", attributes)) keys.push("doors");
  }
  if (step === 4) {
    if (isFieldMissing("defects", attributes)) keys.push("defects");
    if (isFieldMissing("color", attributes)) keys.push("color");
    if (isFieldMissing("mileage", attributes)) keys.push("mileage");
  }
  return keys;
}

/** Keys missing on a specific NT wizard step (for red highlight). */
export function getRealEstateStepMissingKeys(
  step: number,
  attributes: CategoryAttributes,
  extras?: { previewImage?: string | null; description?: string; price?: number; contact?: string; termsAccepted?: boolean }
): string[] {
  const propertyType = String(attributes.propertyType ?? "");
  const isLand = LAND_PROPERTY_TYPES.has(propertyType);
  const keys: string[] = [];

  if (step === 1 && isFieldMissing("propertyType", attributes)) keys.push("propertyType");
  if (step === 2 && isFieldMissing("transactionType", attributes)) keys.push("transactionType");
  if (step === 3) {
    if (isFieldMissing("municipality", attributes)) keys.push("municipality");
    if (isFieldMissing("settlement", attributes)) keys.push("settlement");
  }
  if (step === 4) {
    if (isLand) {
      if (
        isFieldMissing("area", attributes) &&
        isFieldMissing("landArea", attributes) &&
        isFieldMissing("plotArea", attributes)
      ) {
        keys.push("area");
      }
    } else {
      if (isFieldMissing("area", attributes)) keys.push("area");
      if (isFieldMissing("furnishing", attributes)) keys.push("furnishing");
    }
  }
  if (step === 5 && !isLand) {
    if (isFieldMissing("rooms", attributes)) keys.push("rooms");
    if (isFieldMissing("heating", attributes)) keys.push("heating");
  }
  if (step === 6 && !extras?.previewImage && isEmpty(extras?.description)) {
    keys.push("description");
  }
  if (step === 7) {
    if ((extras?.price ?? 0) <= 0) keys.push("price");
    if (isEmpty(extras?.contact)) keys.push("contact");
    if (!extras?.termsAccepted) keys.push("terms");
  }
  return keys;
}

export function wizardInvalidClass(invalid: boolean): string {
  return invalid ? "nt-wizard-field-invalid" : "";
}
