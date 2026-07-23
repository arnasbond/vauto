/**
 * VAUTO Universal Category Registry — single source of truth.
 * App types, validation, adaptive UI, and docs schema must stay aligned.
 */

export const LISTING_CATEGORY_IDS = [
  "vehicles",
  "transport",
  "real_estate",
  "clothing",
  "electronics",
  "home",
  "tools",
  "rental",
  "services",
  "jobs",
  "other",
] as const;

export type RegistryListingCategory = (typeof LISTING_CATEGORY_IDS)[number];

export const LISTING_CATEGORY_LABELS: Record<RegistryListingCategory, string> = {
  vehicles: "Automobiliai",
  transport: "Transportas",
  real_estate: "Nekilnojamas turtas",
  clothing: "Mada ir apranga",
  electronics: "Elektronika",
  home: "Namai ir buitis",
  tools: "Įrankiai",
  rental: "Nuoma",
  services: "Paslaugos",
  jobs: "Darbas",
  other: "Kita",
};

/** Categories that use vehicle/VIN/OCR extractors. */
export const VEHICLE_FAMILY_CATEGORIES = new Set<RegistryListingCategory>([
  "vehicles",
  "transport",
]);

export function isListingCategoryId(value: unknown): value is RegistryListingCategory {
  return (
    typeof value === "string" &&
    (LISTING_CATEGORY_IDS as readonly string[]).includes(value)
  );
}

export function normalizeListingCategoryId(
  value: unknown,
  fallback: RegistryListingCategory = "other"
): RegistryListingCategory {
  if (isListingCategoryId(value)) return value;
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const aliases: Record<string, RegistryListingCategory> = {
    automobiliai: "vehicles",
    auto: "vehicles",
    cars: "vehicles",
    transportas: "transport",
    nt: "real_estate",
    nekilnojamas: "real_estate",
    fashion: "clothing",
    apparel: "clothing",
    mada: "clothing",
    apranga: "clothing",
    elektronika: "electronics",
    appliances: "home",
    buitis: "home",
    irankiai: "tools",
    nuoma: "rental",
    paslaugos: "services",
    darbas: "jobs",
    jobs: "jobs",
  };
  if (isListingCategoryId(raw)) return raw;
  return aliases[raw] ?? fallback;
}

export function isVehicleFamilyCategory(category: unknown): boolean {
  return VEHICLE_FAMILY_CATEGORIES.has(normalizeListingCategoryId(category));
}
