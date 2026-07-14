import type { CategoryFieldDef } from "@/lib/adaptive-categories";
import { getAdaptiveConfig, listingToAdaptiveKey } from "@/lib/adaptive-categories";
import { allForeignSchemaKeys } from "@/lib/listing-attribute-isolation";
import type { ListingCategory } from "@/lib/types";

const HIDDEN_ATTR_KEYS = new Set([
  "sellerType",
  "companyName",
  "fashionCategory",
  "skelbiuCategory",
  "socialPublish",
  "socialPublishFacebook",
  "socialPublishInstagram",
  "profileContactSynced",
  "sellerId",
  "clientDraftId",
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
]);

function humanizeAttrKey(key: string): string {
  const known: Record<string, string> = {
    mileage: "Rida (km)",
    make: "Markė",
    model: "Modelis",
    year: "Metai",
    weight: "Svoris",
    warranty: "Garantija",
    condition: "Būklė",
    brand: "Prekės ženklas",
    size: "Dydis",
    color: "Spalva",
    rooms: "Kambariai",
    area: "Plotas",
    vin: "VIN",
  };
  if (known[key]) return known[key];
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/** Merge static adaptive schema with AI-extracted attributes into one universal basket. */
export function buildUniversalListingFields(
  category: ListingCategory,
  attributes: Record<string, string | string[] | undefined> = {}
): {
  schemaFields: CategoryFieldDef[];
  dynamicFields: CategoryFieldDef[];
} {
  const adaptiveKey = listingToAdaptiveKey(category);
  const config = getAdaptiveConfig(adaptiveKey);
  const schemaKeys = new Set(config.fields.map((f) => f.key));
  const foreignKeys = allForeignSchemaKeys(adaptiveKey);

  const dynamicFields: CategoryFieldDef[] = [];
  for (const [key, raw] of Object.entries(attributes)) {
    if (HIDDEN_ATTR_KEYS.has(key) || schemaKeys.has(key) || foreignKeys.has(key)) continue;
    const val = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "").trim();
    if (!val) continue;
    dynamicFields.push({
      key,
      label: humanizeAttrKey(key),
      placeholder: val,
      gridSpan: 2,
    });
  }

  return { schemaFields: config.fields, dynamicFields };
}

export function getUniversalCategoryLabel(category: ListingCategory): string {
  return getAdaptiveConfig(listingToAdaptiveKey(category)).label;
}
