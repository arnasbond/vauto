import type { ListingCategory } from "@/lib/types";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
  type MarketplaceRadiusKm,
} from "@/lib/marketplace-view";
import type { CategoryAttributeFilters } from "@/lib/category-attribute-filters";
import type { FacetChip } from "@/lib/ai-facet-interpretation";

/**
 * Stage 18A/18B — apply or clear a single AI-interpreted facet onto the
 * canonical MarketplaceFilterState. This is the WRITE side of the
 * conversational adapter: the UI never keeps a separate "AI filter model";
 * chips read/write the same canonical state the classic filter bar uses.
 */

export type ChipEditTarget =
  | { type: "vertical"; value: ListingCategory | "all" }
  | { type: "location"; value: string }
  | { type: "price"; field: "priceMin" | "priceMax"; value: number | null }
  | { type: "condition"; value: "new" | "used" | "all" }
  | { type: "radius"; value: MarketplaceRadiusKm | null }
  | { type: "attribute"; key: string; value: string };

/**
 * Map a single interpreted FacetChip onto the canonical ChipEditTarget for the
 * SAME field, using the chip's own parsed value. This is the production write
 * bridge between the AI readout and the shared MarketplaceFilterState: the UI
 * (AiInterpretationChips) and any consumer (tests) use this exact function, so
 * there is no second place that re-declares how a chip writes to filter state.
 * Keyword chips (make/model) edit the search query, not the filter state, and
 * are intentionally mapped to null.
 */
export function chipToFacetTarget(
  chip: FacetChip,
  nextValue: string
): ChipEditTarget | null {
  switch (chip.kind) {
    case "vertical":
      return { type: "vertical", value: nextValue as never };
    case "location":
      return { type: "location", value: nextValue };
    case "price":
      return {
        type: "price",
        field: chip.field === "priceMin" ? "priceMin" : "priceMax",
        value: Number(nextValue) || null,
      };
    case "condition":
      return {
        type: "condition",
        value: (
          nextValue === "Naujas" ? "new" : nextValue === "Naudotas" ? "used" : "all"
        ) as never,
      };
    case "radius": {
      const km = Number.parseInt(nextValue.replace(/\D/g, ""), 10);
      const snapped = (km >= 5 && km <= 50 ? (km as 5 | 10 | 20 | 50) : null) as never;
      return { type: "radius", value: snapped };
    }
    case "attribute":
      return { type: "attribute", key: chip.field, value: nextValue };
    case "keyword":
      return null;
  }
}

/**
 * Apply a full AI facet interpretation (a FacetChip[]) onto a canonical filter
 * state in one pass, using chipToFacetTarget for every non-keyword chip. The
 * vertical chip is produced first by the interpreter and applies first, which
 * is required because changing the vertical resets stale category attributes.
 * Returns the normalized next state.
 */
export function applyFacetChips(
  filters: MarketplaceFilterState,
  chips: FacetChip[]
): MarketplaceFilterState {
  let acc = filters;
  for (const chip of chips) {
    if (chip.kind === "keyword") continue;
    const target = chipToFacetTarget(chip, chip.value);
    if (target) acc = applyAiFacet(acc, target);
  }
  return acc;
}

/** Set (or update) a facet on the canonical state. Returns a normalized copy. */
export function applyAiFacet(
  filters: MarketplaceFilterState,
  target: ChipEditTarget
): MarketplaceFilterState {
  const next = { ...filters };

  switch (target.type) {
    case "vertical":
      next.category = target.value;
      if (target.value === "all") {
        next.categoryAttributes = { ...DEFAULT_MARKETPLACE_FILTERS.categoryAttributes };
      } else {
        // Changing vertical resets stale attribute facets from a different class.
        next.categoryAttributes = {};
      }
      break;
    case "location":
      next.location = target.value;
      break;
    case "price":
      next[target.field] = target.value;
      break;
    case "condition":
      next.condition = target.value;
      break;
    case "radius":
      next.radiusKm = target.value;
      break;
    case "attribute":
      // Write into canonical category-attribute facet registry.
      next.categoryAttributes = {
        ...(next.categoryAttributes as CategoryAttributeFilters),
        [target.key]: target.value,
      };
      break;
  }

  return normalizeMarketplaceFilters(next);
}

/** Clear (remove) a single facet from the canonical state. */
export function removeAiFacet(
  filters: MarketplaceFilterState,
  key: string
): MarketplaceFilterState {
  const next = { ...filters };
  switch (key) {
    case "category":
      next.category = "all";
      next.categoryAttributes = {};
      break;
    case "location":
      next.location = "";
      break;
    case "priceMin":
      next.priceMin = null;
      break;
    case "priceMax":
      next.priceMax = null;
      break;
    case "condition":
      next.condition = "all";
      break;
    case "radiusKm":
      next.radiusKm = null;
      break;
    default:
      // Canonical category-attribute key.
      next.categoryAttributes = {
        ...(next.categoryAttributes as CategoryAttributeFilters),
      };
      delete next.categoryAttributes[key];
      break;
  }
  return normalizeMarketplaceFilters(next);
}
