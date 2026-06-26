import type { Listing, ListingCategory } from "@/lib/types";
import {
  BODY_TYPES,
  DEFECT_OPTIONS,
  DRIVE_TYPES,
  FUEL_TYPES,
  GEARBOX_TYPES,
  VEHICLE_EQUIPMENT_OPTIONS,
} from "@/lib/vehicle-catalog";
import { VINTED_CONDITIONS } from "@/lib/clothing-catalog";
import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES_FULL,
  EXPERIENCE_YEARS,
  LANGUAGE_OPTIONS,
} from "@/lib/job-catalog";
import {
  FEATURE_OPTIONS,
  LAND_PURPOSE_OPTIONS,
  LAND_UTILITY_OPTIONS,
} from "@/lib/real-estate-catalog";
import { JOB_TYPE_OFFER, JOB_TYPE_SEEK } from "@/lib/jobs";

export type CategoryAttributeFilters = Record<string, string>;

export const EMPTY_CATEGORY_ATTRIBUTE_FILTERS: CategoryAttributeFilters = {};

export interface CategoryFilterFieldDef {
  key: string;
  label: string;
  options: readonly string[];
  /** Match listing.attributes[key] or aliases */
  attributeKeys?: string[];
  /** When true, filter value must appear in a string[] attribute */
  checklist?: boolean;
}

function attrValue(listing: Listing, keys: string[]): string {
  const attrs = listing.attributes ?? {};
  for (const key of keys) {
    const raw = attrs[key];
    if (raw == null) continue;
    const text = Array.isArray(raw) ? raw.join(" ") : String(raw);
    if (text.trim()) return text.trim();
  }
  return "";
}

function attrChecklist(listing: Listing, keys: string[]): string[] {
  const attrs = listing.attributes ?? {};
  const out: string[] = [];
  for (const key of keys) {
    const raw = attrs[key];
    if (Array.isArray(raw)) out.push(...raw.map(String));
    else if (typeof raw === "string" && raw.trim()) {
      out.push(...raw.split(/,|\|\|/).map((s) => s.trim()).filter(Boolean));
    }
  }
  return out;
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/** NT sandorio tipų sinonimai tarp wizard ir filtro žodynų. */
function normalizeTransactionToken(value: string): string {
  const n = norm(value);
  if (n === "pardavimui" || n === "parduoda") return "parduoda";
  if (n === "nuomai" || n === "nuomoja") return "nuomoja";
  if (n.includes("trumpalaik")) return "trumpalaikė nuoma";
  return n;
}

function matchesChecklist(listing: Listing, field: CategoryFilterFieldDef, filterValue: string): boolean {
  const keys = field.attributeKeys ?? [field.key];
  const items = attrChecklist(listing, keys);
  if (items.length === 0) return false;
  const nFilter = norm(filterValue);
  return items.some((item) => {
    const nItem = norm(item);
    return nItem === nFilter || nItem.includes(nFilter) || nFilter.includes(nItem);
  });
}

function matchesOption(listing: Listing, field: CategoryFilterFieldDef, filterValue: string): boolean {
  if (!filterValue) return true;
  if (field.checklist) return matchesChecklist(listing, field, filterValue);

  const keys = field.attributeKeys ?? [field.key];
  const listingVal = attrValue(listing, keys);

  if (field.key === "yearFrom" || field.key === "yearTo") {
    const year = parseInt(listingVal.replace(/\D/g, "").slice(0, 4), 10);
    const bound = parseInt(filterValue, 10);
    if (!Number.isFinite(year) || !Number.isFinite(bound)) return false;
    return field.key === "yearFrom" ? year >= bound : year <= bound;
  }
  if (field.key === "mileageMax") {
    const km = parseInt(listingVal.replace(/\D/g, ""), 10);
    const max = parseInt(filterValue, 10);
    return Number.isFinite(km) && Number.isFinite(max) ? km <= max : false;
  }
  if (field.key === "areaMin") {
    const area = parseFloat(listingVal.replace(/[^\d.]/g, ""));
    const min = parseFloat(filterValue);
    return Number.isFinite(area) && Number.isFinite(min) ? area >= min : false;
  }
  if (field.key === "landAreaMin") {
    const land = attrValue(listing, ["landArea", "plotArea"]);
    const num = parseFloat(land.replace(/[^\d.]/g, ""));
    const min = parseFloat(filterValue);
    return Number.isFinite(num) && Number.isFinite(min) ? num >= min : false;
  }

  if (!listingVal) return false;
  const nListing = norm(listingVal);
  const nFilter = norm(filterValue);

  if (field.key === "transactionType") {
    return (
      normalizeTransactionToken(listingVal) === normalizeTransactionToken(filterValue) ||
      nListing.includes(nFilter) ||
      nFilter.includes(nListing)
    );
  }

  if (nListing === nFilter || nListing.includes(nFilter)) return true;

  return false;
}

export function categoryFilterFieldsFor(
  category: ListingCategory | "all"
): CategoryFilterFieldDef[] {
  switch (category) {
    case "vehicles":
      return [
        { key: "yearFrom", label: "Metai nuo", options: ["2000", "2005", "2010", "2015", "2018", "2020"], attributeKeys: ["year"] },
        { key: "yearTo", label: "Metai iki", options: ["2010", "2015", "2018", "2020", "2022", "2024", "2026"], attributeKeys: ["year"] },
        { key: "fuelType", label: "Kuras", options: FUEL_TYPES, attributeKeys: ["fuelType", "kuras"] },
        { key: "bodyType", label: "Kėbulas", options: BODY_TYPES, attributeKeys: ["bodyType", "kebulas"] },
        { key: "gearbox", label: "Pavarų dėžė", options: GEARBOX_TYPES, attributeKeys: ["gearbox", "transmission"] },
        { key: "driveType", label: "Varantieji ratai", options: DRIVE_TYPES },
        {
          key: "defects",
          label: "Defektai",
          options: DEFECT_OPTIONS,
          attributeKeys: ["defects"],
        },
        {
          key: "vehicleOptions",
          label: "Opcija",
          options: VEHICLE_EQUIPMENT_OPTIONS,
          attributeKeys: ["vehicleOptions"],
          checklist: true,
        },
        { key: "mileageMax", label: "Rida iki (km)", options: ["50000", "100000", "150000", "200000", "300000"], attributeKeys: ["mileage"] },
      ];
    case "real_estate":
      return [
        {
          key: "transactionType",
          label: "Sandoris",
          options: ["Parduoda", "Nuomoja", "Trumpalaikė nuoma", "Pardavimui", "Nuomai"],
          attributeKeys: ["transactionType"],
        },
        {
          key: "propertyType",
          label: "Objektas",
          options: ["butas", "namas", "sklypas", "patalpos", "garazas", "sodyba"],
          attributeKeys: ["propertyType", "property_type"],
        },
        { key: "rooms", label: "Kambariai", options: ["1", "2", "3", "4", "5+"] },
        {
          key: "furnishing",
          label: "Įrengimas",
          options: ["Įrengtas", "Dalinė apdaila", "Neįrengtas", "Remontuotinas"],
          attributeKeys: ["furnishing", "condition", "irengimas"],
        },
        {
          key: "heating",
          label: "Šildymas",
          options: ["Centrinis", "Autonominis/Dujinis", "Aeroterminis", "Kietu kuru"],
          attributeKeys: ["heating", "sildymas"],
          checklist: true,
        },
        {
          key: "landPurpose",
          label: "Sklypo paskirtis",
          options: LAND_PURPOSE_OPTIONS,
        },
        {
          key: "landUtilities",
          label: "Komunikacijos",
          options: LAND_UTILITY_OPTIONS,
          attributeKeys: ["landUtilities", "utilities"],
          checklist: true,
        },
        {
          key: "ntFeatures",
          label: "Ypatumai",
          options: FEATURE_OPTIONS.slice(0, 8),
          attributeKeys: ["ntFeatures", "features"],
          checklist: true,
        },
        { key: "areaMin", label: "Plotas nuo (m²)", options: ["30", "50", "70", "100", "150"], attributeKeys: ["area"] },
        { key: "landAreaMin", label: "Sklypas nuo (a)", options: ["3", "6", "10", "15", "20"] },
      ];
    case "clothing":
      return [
        {
          key: "clothingType",
          label: "Tipas",
          options: ["Moterims", "Vyrams", "Vaikams", "Namams / Interjerui", "Augintiniams"],
          attributeKeys: ["clothingType", "vintedCategory"],
        },
        { key: "size", label: "Dydis", options: ["XS", "S", "M", "L", "XL", "XXL", "38", "40", "42"] },
        { key: "condition", label: "Būklė", options: VINTED_CONDITIONS },
        { key: "brand", label: "Prekės ženklas", options: ["Nike", "Zara", "H&M", "Adidas", "Kita"] },
        {
          key: "color",
          label: "Spalva",
          options: ["Juoda", "Balta", "Mėlyna", "Raudona", "Pilka"],
          attributeKeys: ["color", "colors"],
          checklist: true,
        },
        {
          key: "shipping",
          label: "Siuntimas",
          options: ["LP Express / Omniva terminalas", "Paštas", "Atsiėmimas gyvai"],
          attributeKeys: ["shipping", "shippingOptions"],
          checklist: true,
        },
      ];
    case "jobs":
      return [
        { key: "jobType", label: "Srautas", options: [JOB_TYPE_OFFER, JOB_TYPE_SEEK] },
        {
          key: "employmentType",
          label: "Etatas",
          options: EMPLOYMENT_TYPES_FULL,
          attributeKeys: ["employmentType"],
        },
        {
          key: "locationType",
          label: "Darbo vieta",
          options: ["Nuotolinis", "Ofise", "Hibridinis", "Lietuva", "Darbas namuose"],
        },
        {
          key: "experienceRequired",
          label: "Patirtis",
          options: EXPERIENCE_YEARS,
          attributeKeys: ["experienceRequired", "experience"],
        },
        {
          key: "education",
          label: "Išsilavinimas",
          options: EDUCATION_LEVELS,
          attributeKeys: ["education", "educationLevel"],
        },
        {
          key: "languages",
          label: "Kalbos",
          options: LANGUAGE_OPTIONS,
          attributeKeys: ["languages"],
          checklist: true,
        },
      ];
    default:
      return [];
  }
}

export function applyCategoryAttributeFilters<T extends Listing>(
  listings: T[],
  category: ListingCategory | "all",
  filters: CategoryAttributeFilters
): T[] {
  const fields = categoryFilterFieldsFor(category);
  const active = Object.entries(filters).filter(([, v]) => v.trim());
  if (active.length === 0 || category === "all") return listings;

  return listings.filter((listing) => {
    if (listing.category !== category) return true;
    return active.every(([key, value]) => {
      const field = fields.find((f) => f.key === key);
      if (!field) return true;
      return matchesOption(listing, field, value);
    });
  });
}

export function countActiveCategoryFilters(filters: CategoryAttributeFilters): number {
  return Object.values(filters).filter((v) => v.trim()).length;
}
