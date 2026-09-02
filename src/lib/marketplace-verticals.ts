import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  CarFront,
  Cpu,
  Home,
  Package,
  Shirt,
  Wrench,
} from "lucide-react";
import {
  CANONICAL_VERTICALS,
  type VerticalId,
  type VerticalUiSlug,
} from "@vauto/shared/marketplace-domain";
import {
  visibleCategoryOptions,
  type VisibleCategoryId,
} from "@vauto/shared/category-registry";

export type MarketplaceVerticalId = VerticalUiSlug;

export type MarketplaceVertical = {
  id: MarketplaceVerticalId;
  canonicalId: VerticalId;
  label: string;
  query: string;
  icon: LucideIcon;
};

const VERTICAL_ICONS: Record<VerticalUiSlug, LucideIcon> = {
  transport: CarFront,
  real_estate: Building2,
  electronics: Cpu,
  services: Wrench,
  jobs: Briefcase,
  home: Home,
};

/** Equal-weight marketplace verticals — labels/ids from Stage 13A registry. */
export const MARKETPLACE_VERTICALS: readonly MarketplaceVertical[] =
  CANONICAL_VERTICALS.map((vertical) => ({
    id: vertical.uiSlug,
    canonicalId: vertical.id,
    label: vertical.label,
    query: vertical.searchQuery,
    icon: VERTICAL_ICONS[vertical.uiSlug],
  }));

export const MARKETPLACE_VERTICAL_LABELS = MARKETPLACE_VERTICALS.map(
  (v) => v.label
);

/* ---------------------------------------------------------------------- */
/* F7 — the HOME category grid shows EXACTLY the 8 user-visible categories
 * from the SAME canonical registry the filters use (visibleCategoryOptions).
 * No extra top-level categories; legacy slugs fold per VISIBLE_CATEGORY_BY_SLUG. */
/* ---------------------------------------------------------------------- */

export type HomeCategory = {
  id: VisibleCategoryId;
  label: string;
  query: string;
  icon: LucideIcon;
};

const HOME_CATEGORY_ICONS: Record<VisibleCategoryId, LucideIcon> = {
  vehicles: CarFront,
  real_estate: Building2,
  electronics: Cpu,
  clothing: Shirt,
  home: Home,
  services: Wrench,
  jobs: Briefcase,
  other: Package,
};

/** Free-text search query per visible category (empty = no prefill). */
const HOME_CATEGORY_QUERIES: Record<VisibleCategoryId, string> = {
  vehicles: "automobiliai",
  real_estate: "butas",
  electronics: "telefonas",
  clothing: "drabužiai",
  home: "baldai",
  services: "paslaugos",
  jobs: "darbas",
  other: "",
};

/** The single 8-category list shared by the home grid and category pickers. */
export const HOME_CATEGORIES: readonly HomeCategory[] =
  visibleCategoryOptions().map(({ id, label }) => ({
    id,
    label,
    query: HOME_CATEGORY_QUERIES[id],
    icon: HOME_CATEGORY_ICONS[id],
  }));
