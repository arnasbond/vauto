import type { ListingCategory } from "@/lib/types";
export type AdaptiveCategoryKey =
  | "vehicles"
  | "transport"
  | "clothing"
  | "services"
  | "jobs"
  | "real_estate"
  | "electronics"
  | "tools"
  | "rental"
  | "home"
  | "universal";

export type FieldInputType = "text" | "select" | "checklist" | "textarea";

export interface CategoryFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  critical?: boolean;
  inputType?: FieldInputType;
  options?: string[];
  gridSpan?: 1 | 2;
}

export interface AdaptiveCategoryConfig {
  key: AdaptiveCategoryKey;
  label: string;
  portalStyle: string;
  layout: "technical-grid" | "tag-social" | "service-profile" | "estate-sheet" | "universal";
  fields: CategoryFieldDef[];
  baseFields: ("title" | "price" | "location" | "contact" | "description")[];
}

export function listingToAdaptiveKey(
  category: ListingCategory
): AdaptiveCategoryKey {
  switch (category) {
    case "vehicles":
      return "vehicles";
    case "transport":
      return "transport";
    case "clothing":
      return "clothing";
    case "services":
      return "services";
    case "jobs":
      return "jobs";
    case "real_estate":
      return "real_estate";
    case "electronics":
      return "electronics";
    case "tools":
      return "tools";
    case "rental":
      return "rental";
    case "home":
      return "home";
    default:
      return "universal";
  }
}
