import type { Listing, ListingCategory } from "@/lib/types";
import { BODY_TYPES, DRIVE_TYPES, FUEL_TYPES, GEARBOX_TYPES } from "@/lib/vehicle-catalog";
import { VINTED_CONDITIONS } from "@/lib/clothing-catalog";
import { JOB_TYPE_OFFER, JOB_TYPE_SEEK } from "@/lib/jobs";

export type CategoryAttributeFilters = Record<string, string>;

export const EMPTY_CATEGORY_ATTRIBUTE_FILTERS: CategoryAttributeFilters = {};

export interface CategoryFilterFieldDef {
  key: string;
  label: string;
  options: readonly string[];
  /** Match listing.attributes[key] or aliases */
  attributeKeys?: string[];
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

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function matchesOption(listing: Listing, field: CategoryFilterFieldDef, filterValue: string): boolean {
  if (!filterValue) return true;
  const keys = field.attributeKeys ?? [field.key];
  const listingVal = attrValue(listing, keys);
  if (!listingVal) return false;
  const nListing = norm(listingVal);
  const nFilter = norm(filterValue);
  if (nListing === nFilter || nListing.includes(nFilter)) return true;
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
  return false;
}

export function categoryFilterFieldsFor(
  category: ListingCategory | "all"
): CategoryFilterFieldDef[] {
  switch (category) {
    case "vehicles":
      return [
        { key: "yearFrom", label: "Metai nuo", options: ["2000", "2005", "2010", "2015", "2018", "2020"] },
        { key: "yearTo", label: "Metai iki", options: ["2010", "2015", "2018", "2020", "2022", "2024", "2026"] },
        { key: "fuelType", label: "Kuras", options: FUEL_TYPES, attributeKeys: ["fuelType", "kuras"] },
        { key: "bodyType", label: "Kėbulas", options: BODY_TYPES, attributeKeys: ["bodyType", "kebulas"] },
        { key: "gearbox", label: "Pavarų dėžė", options: GEARBOX_TYPES, attributeKeys: ["gearbox", "transmission"] },
        { key: "driveType", label: "Varantieji ratai", options: DRIVE_TYPES },
        { key: "mileageMax", label: "Rida iki (km)", options: ["50000", "100000", "150000", "200000", "300000"] },
      ];
    case "real_estate":
      return [
        {
          key: "transactionType",
          label: "Sandoris",
          options: ["Parduoda", "Nuomoja", "Trumpalaikė nuoma"],
        },
        {
          key: "propertyType",
          label: "Objektas",
          options: ["butas", "namas", "sklypas", "patalpos"],
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
        },
        { key: "areaMin", label: "Plotas nuo (m²)", options: ["30", "50", "70", "100", "150"] },
      ];
    case "clothing":
      return [
        {
          key: "clothingType",
          label: "Tipas",
          options: ["Moterims", "Vyrams", "Vaikams"],
          attributeKeys: ["clothingType", "vintedCategory"],
        },
        { key: "size", label: "Dydis", options: ["XS", "S", "M", "L", "XL", "XXL"] },
        { key: "condition", label: "Būklė", options: VINTED_CONDITIONS },
        { key: "brand", label: "Prekės ženklas", options: ["Nike", "Zara", "H&M", "Adidas", "Kita"] },
        { key: "color", label: "Spalva", options: ["Juoda", "Balta", "Mėlyna", "Raudona", "Pilka"] },
      ];
    case "jobs":
      return [
        { key: "jobType", label: "Srautas", options: [JOB_TYPE_OFFER, JOB_TYPE_SEEK] },
        {
          key: "employmentType",
          label: "Etatas",
          options: ["Pilnas etatas", "Pusė etato", "Projektinis", "Praktika"],
        },
        {
          key: "locationType",
          label: "Darbo vieta",
          options: ["Nuotolinis", "Ofise", "Hibridinis", "Lietuva"],
        },
        {
          key: "experienceRequired",
          label: "Patirtis",
          options: ["Nereikia", "1-3 metai", "3-5 metai", "5+ metų"],
          attributeKeys: ["experienceRequired", "requirements"],
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
