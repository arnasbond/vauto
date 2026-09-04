import {
  CANONICAL_VERTICALS,
  VERTICAL_ATTRIBUTES,
  VERTICAL_CAPABILITIES,
  getFilterableAttributes,
  listingCategoriesForVertical,
  type AttributeDefinition,
  type VerticalId,
} from "@vauto/shared/marketplace-domain";
import type { Listing, ListingCategory } from "@/lib/types";

/**
 * Stage 22A — VAUTO capability-driven vertical presentation contract.
 *
 * ONE VAUTO design system + ONE canonical marketplace architecture +
 * vertical-specific data/capabilities. This module is a READ-ONLY presentation
 * adapter over the canonical shared domain registry — it never re-declares
 * vertical structure, attribute schemas, capability rules or filter taxonomy.
 *
 * - The SET of verticals comes from `CANONICAL_VERTICALS`.
 * - The attribute schema for each vertical comes from `VERTICAL_ATTRIBUTES`.
 * - The capabilities (price / shipping / appointments / applications…) come
 *   from `VERTICAL_CAPABILITIES`.
 *
 * The presentation layer maps canonical capabilities to UI configuration:
 * which attributes surface on result cards, which view modes are meaningful,
 * which detail sections are primary. It must NOT redefine domain truth.
 */

/** Vertical presentation ids mirror the canonical domain (no parallel registry). */
export type VerticalPresentationKey = VerticalId;

/** Map capability: PRIMARY / SUPPORTED / NOT_APPLICABLE per vertical. */
export type ViewModeCapabilityLevel = "PRIMARY" | "SUPPORTED" | "NOT_APPLICABLE";

export interface ViewModeCapability {
  list: boolean;
  grid: boolean;
  map: ViewModeCapabilityLevel;
  /** Why the map level applies (audit evidence, Lithuanian). */
  mapRationale: string;
}

/** A canonical attribute surfaced on a result card. */
export interface CardAttributeSpec {
  /** Canonical attribute key from VERTICAL_ATTRIBUTES (never invented). */
  key: string;
  /** Canonical label (from the shared registry where available). */
  label: string;
  /** Optional display prefix e.g. "nuo " for salary. */
  prefix?: string;
  /**
   * Legacy data-shape aliases for the same canonical value (e.g. the mock
   * catalog stores jobs "position" where the canonical schema is "jobTitle").
   * Presentation-layer compatibility only — the canonical key remains the
   * domain truth and no value is invented.
   */
  aliasKeys?: readonly string[];
}

export interface VerticalPresentationContract {
  verticalId: VerticalId;
  label: string;
  description: string;
  /** Canonical listing category(ies) for the vertical. */
  listingCategories: readonly string[];
  /** Attribute schema (filterable/searchable) — canonical, read-only. */
  attributes: readonly AttributeDefinition[];
  /** Capabilities — canonical, read-only. */
  capabilities: typeof VERTICAL_CAPABILITIES[VerticalId];
  /** Which canonical attributes surface on result cards, in display order. */
  cardAttributes: readonly CardAttributeSpec[];
  /** View modes meaningful for this vertical. */
  viewModes: ViewModeCapability;
  /** Primary decision-information order for listing detail. */
  detailPriority: readonly string[];
}

const LT_LABELS: Record<string, string> = {
  make: "Markė",
  model: "Modelis",
  year: "Metai",
  mileage: "Rida",
  fuelType: "Kuro tipas",
  transmission: "Transmisija",
  propertyType: "Objekto tipas",
  area: "Plotas",
  rooms: "Kambariai",
  yearBuilt: "Statybos metai",
  floor: "Aukštas",
  manufacturer: "Gamintojas",
  deviceModel: "Modelis",
  condition: "Būklė",
  storage: "Atmintis",
  warranty: "Garantija",
  serviceType: "Paslaugos tipas",
  serviceMode: "Lokacija / nuotoliu",
  pricingType: "Kainodara",
  duration: "Trukmė",
  jobTitle: "Pareigos",
  employmentType: "Darbo forma",
  salaryMin: "Atlygis nuo",
  salaryMax: "Atlygis iki",
  workType: "Darbo tipas",
  itemType: "Prekės tipas",
  material: "Medžiaga",
  deliveryOption: "Pristatymas",
};

/**
 * Resolve a canonical attribute definition for a vertical by key. Falls back to
 * the shared attribute list so presentation never hardcodes a divergent schema.
 */
function attrDef(verticalId: VerticalId, key: string): AttributeDefinition | undefined {
  const attrs = VERTICAL_ATTRIBUTES[verticalId];
  return attrs.find((a) => a.key === key);
}

function labelFor(verticalId: VerticalId, key: string): string {
  return attrDef(verticalId, key)?.label ?? LT_LABELS[key] ?? key;
}

/** Map capability derived from canonical capabilities + vertical semantics. */
function mapCapabilityFor(verticalId: VerticalId): ViewModeCapabilityLevel {
  const caps = VERTICAL_CAPABILITIES[verticalId];
  switch (verticalId) {
    case "REAL_ESTATE":
      return "PRIMARY";
    case "SERVICES":
      return "SUPPORTED";
    case "TRANSPORT":
      return "SUPPORTED";
    case "ELECTRONICS":
      return "SUPPORTED";
    case "JOBS":
      return "NOT_APPLICABLE";
    case "HOME_GARDEN":
      return caps.supportsShipping ? "SUPPORTED" : "NOT_APPLICABLE";
    default:
      return "NOT_APPLICABLE";
  }
}

function mapRationale(verticalId: VerticalId): string {
  switch (verticalId) {
    case "REAL_ESTATE":
      return "Vieta yra pirminis sprendimo kriterijus — žemėlapis yra pagrindinis rodinys.";
    case "SERVICES":
      return "Paslaugos susietos su aptarnavimo vieta — žemėlapis naudingas, bet ne vienintelis.";
    case "TRANSPORT":
      return "Transporto paieška dažnai vyksta pagal techninius parametrus — žemėlapis antrinis.";
    case "ELECTRONICS":
      return "Elektronika siunčiama — žemėlapis neprivalomas, tačiau atsiėmimui naudingas.";
    case "JOBS":
      return "Darbas gali būti nuotolinis — žemėlapis ne visada prasmingas.";
    case "HOME_GARDEN":
      return "Prekės siunčiamos — žemėlapis neprivalomas.";
    default:
      return "Žemėlapis šiai vertikalei netaikomas.";
  }
}

function buildContract(verticalId: VerticalId): VerticalPresentationContract {
  const vertical = CANONICAL_VERTICALS.find((v) => v.id === verticalId);
  const attrs = VERTICAL_ATTRIBUTES[verticalId];
  const caps = VERTICAL_CAPABILITIES[verticalId];

  const cardAttributes: readonly CardAttributeSpec[] = (() => {
    switch (verticalId) {
      case "TRANSPORT":
        return [
          { key: "make", label: "Markė" },
          { key: "model", label: "Modelis" },
          { key: "year", label: "Metai" },
          { key: "mileage", label: "Rida" },
          { key: "fuelType", label: "Kuro tipas" },
          { key: "transmission", label: "Transmisija" },
        ];
      case "REAL_ESTATE":
        return [
          { key: "propertyType", label: "Objekto tipas" },
          { key: "rooms", label: "Kambariai" },
          { key: "area", label: "Plotas" },
        ];
      case "ELECTRONICS":
        return [
          { key: "manufacturer", label: "Gamintojas" },
          { key: "deviceModel", label: "Modelis" },
          { key: "condition", label: "Būklė" },
          { key: "storage", label: "Atmintis" },
        ];
      case "SERVICES":
        return [
          { key: "serviceType", label: "Paslaugos tipas" },
          { key: "serviceMode", label: "Lokacija / nuotoliu" },
          { key: "pricingType", label: "Kainodara" },
        ];
      case "JOBS":
        return [
          { key: "jobTitle", label: "Pareigos", aliasKeys: ["position"] },
          { key: "employmentType", label: "Darbo forma", aliasKeys: ["schedule"] },
          { key: "salaryMin", label: "Atlygis nuo" },
          { key: "salaryMax", label: "Atlygis iki" },
          { key: "workType", label: "Darbo tipas" },
        ];
      case "HOME_GARDEN":
        return [
          { key: "itemType", label: "Prekės tipas" },
          { key: "condition", label: "Būklė" },
          { key: "material", label: "Medžiaga" },
          { key: "deliveryOption", label: "Pristatymas" },
        ];
      default:
        return [];
    }
  })();

  const detailPriority = (() => {
    switch (verticalId) {
      case "TRANSPORT":
        return ["price", "make", "model", "year", "mileage", "fuelType", "transmission"];
      case "REAL_ESTATE":
        return ["price", "location", "area", "rooms", "propertyType", "yearBuilt", "floor"];
      case "JOBS":
        return ["salaryMin", "salaryMax", "employmentType", "workType", "jobTitle"];
      case "SERVICES":
        return ["price", "serviceType", "pricingType", "serviceMode", "duration"];
      case "ELECTRONICS":
        return ["price", "manufacturer", "deviceModel", "condition", "storage", "warranty"];
      case "HOME_GARDEN":
        return ["price", "itemType", "condition", "material", "deliveryOption"];
      default:
        return [];
    }
  })();

  return {
    verticalId,
    label: vertical?.label ?? verticalId,
    description: vertical?.description ?? "",
    listingCategories: listingCategoriesForVertical(verticalId),
    attributes: attrs,
    capabilities: caps,
    cardAttributes,
    viewModes: {
      list: true,
      grid: true,
      map: mapCapabilityFor(verticalId),
      mapRationale: mapRationale(verticalId),
    },
    detailPriority,
  };
}

/** All canonical vertical presentation contracts (built once, read-only). */
export const VERTICAL_PRESENTATION_CONTRACTS: Record<
  VerticalId,
  VerticalPresentationContract
> = {
  TRANSPORT: buildContract("TRANSPORT"),
  REAL_ESTATE: buildContract("REAL_ESTATE"),
  ELECTRONICS: buildContract("ELECTRONICS"),
  SERVICES: buildContract("SERVICES"),
  JOBS: buildContract("JOBS"),
  HOME_GARDEN: buildContract("HOME_GARDEN"),
  CLOTHING: buildContract("CLOTHING"),
  OTHER: buildContract("OTHER"),
};

export function presentationContractForVertical(
  verticalId: VerticalId | null | undefined
): VerticalPresentationContract | null {
  if (!verticalId) return null;
  return VERTICAL_PRESENTATION_CONTRACTS[verticalId] ?? null;
}

/**
 * Resolve the canonical vertical contract for a listing using the canonical
 * category → vertical mapping (never a second taxonomy). Uses
 * `listingCategoriesForVertical` so TRANSPORT resolves from both "transport"
 * and the operational marketplace segment "vehicles".
 */
export function presentationContractForListing(
  listing: Pick<Listing, "category">
): VerticalPresentationContract | null {
  const category = listing.category;
  const verticalId = (Object.keys(VERTICAL_PRESENTATION_CONTRACTS) as VerticalId[]).find(
    (id) => listingCategoriesForVertical(id).includes(category)
  );
  if (!verticalId) return null;
  return VERTICAL_PRESENTATION_CONTRACTS[verticalId] ?? null;
}

/** Canonical vertical id for a listing category (clothing → null; not canonical). */
export function verticalIdForListingCategory(
  category: ListingCategory
): VerticalId | null {
  const entry = (Object.keys(VERTICAL_PRESENTATION_CONTRACTS) as VerticalId[]).find((id) =>
    listingCategoriesForVertical(id).includes(category)
  );
  return entry ?? null;
}

/** List of filterable attribute keys for a vertical (canonical, read-only). */
export function filterableAttributeKeysForVertical(
  verticalId: VerticalId | null
): readonly string[] {
  if (!verticalId) return [];
  return getFilterableAttributes(verticalId).map((a) => a.key);
}

/** Which view modes are offered in the UI toolbar for a vertical. */
export function enabledViewModesForVertical(
  verticalId: VerticalId | null
): { mode: "list" | "grid" | "map"; enabled: boolean; mapLevel?: ViewModeCapabilityLevel }[] {
  const contract = presentationContractForVertical(verticalId);
  if (!contract) {
    // No canonical vertical → universal marketplace default (all modes).
    return [
      { mode: "list", enabled: true },
      { mode: "grid", enabled: true },
      { mode: "map", enabled: true, mapLevel: "SUPPORTED" },
    ];
  }
  return [
    { mode: "list", enabled: contract.viewModes.list },
    { mode: "grid", enabled: contract.viewModes.grid },
    {
      mode: "map",
      enabled: contract.viewModes.map !== "NOT_APPLICABLE",
      mapLevel: contract.viewModes.map,
    },
  ];
}

/**
 * Extract a canonical attribute value from a listing attribute map.
 * Only returns values for canonical attribute keys — never invented fields.
 * Handles both raw canonical keys and legacy aliases where the domain schema
 * defines a primary key (e.g. jobs mock data stores `position`, canonical
 * schema key is `jobTitle`).
 */
export function canonicalAttributeValue(
  listing: Pick<Listing, "attributes">,
  key: string,
  aliasKeys?: readonly string[]
): string | null {
  const attrs = listing.attributes ?? {};
  const read = (k: string): string | null => {
    const raw = attrs[k];
    if (raw === undefined || raw === null) return null;
    if (Array.isArray(raw)) {
      const joined = raw.map(String).map((s) => s.trim()).filter(Boolean).join(", ");
      return joined || null;
    }
    const s = String(raw).trim();
    if (!s) return null;
    return s;
  };
  const primary = read(key);
  if (primary) return primary;
  for (const alias of aliasKeys ?? []) {
    const v = read(alias);
    if (v) return v;
  }
  return null;
}

/** Convenience: card attribute lines for a listing (label + value), only canonical. */
export function cardAttributeLinesForListing(
  listing: Pick<Listing, "category" | "attributes">,
  max = 3
): { label: string; value: string; key: string }[] {
  const contract = presentationContractForListing(listing);
  if (!contract) return [];
  const out: { label: string; value: string; key: string }[] = [];
  for (const spec of contract.cardAttributes) {
    if (out.length >= max) break;
    const value = canonicalAttributeValue(listing, spec.key, spec.aliasKeys);
    if (!value) continue;
    const display = spec.prefix ? `${spec.prefix}${value}` : value;
    out.push({
      key: spec.key,
      label: spec.label ?? labelFor(contract.verticalId, spec.key),
      value: display,
    });
  }
  return out;
}
