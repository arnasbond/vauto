import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories";
import type { ListingCategory } from "@/lib/types";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import {
  adaptiveKeyToPresentationId,
  getPromoteLabelsForCategory as getVerticalPromoteLabels,
  getVerticalPresentation,
  type VerticalPresentationId,
  type VerticalPromoteLabels,
  type VerticalPresentationTokens,
} from "@/lib/vertical-presentation";

/**
 * @deprecated Stage 20B.1 — Chameleon/portal semantics are deprecated.
 *
 * This module is kept ONLY as a compatibility bridge for:
 *  - frozen backend invariants (monetization-wardrobe, escrow) that compare
 *    `theme === "wardrobe"`;
 *  - runtime app state (`VautoContext.chameleonTheme`) and seller-flow wiring;
 *  - wardrobe cabinet logic.
 *
 * All generic presentation logic now lives in `@/lib/vertical-presentation`.
 * Active UI components must import from there. Portal-native palettes have
 * been removed — every vertical renders with the DS 2.0 emerald identity.
 */

/**
 * @deprecated Use `VerticalPresentationId` from `@/lib/vertical-presentation`.
 * Kept stable because frozen monetization/escrow modules and runtime state
 * rely on `"wardrobe"`/`"flux"` identity values.
 */
export type ChameleonThemeId =
  | "flux"
  | "autoplius"
  | "wardrobe"
  | "skelbiu"
  | "aruodas"
  | "paslaugos"
  | "cvbankas";

/** @deprecated Use `VerticalPromoteLabels`. */
export type ChameleonPromoteLabels = VerticalPromoteLabels;

/** @deprecated Use `VerticalPresentationTokens`. */
export type ChameleonThemeTokens = VerticalPresentationTokens;

export function themeIdToVerticalId(id: ChameleonThemeId): VerticalPresentationId {
  switch (id) {
    case "autoplius":
      return "transport";
    case "wardrobe":
      return "fashion";
    case "aruodas":
      return "real_estate";
    case "paslaugos":
      return "services";
    case "cvbankas":
      return "jobs";
    case "skelbiu":
      return "goods";
    default:
      return "marketplace";
  }
}

export function verticalIdToThemeId(id: VerticalPresentationId): ChameleonThemeId {
  switch (id) {
    case "transport":
      return "autoplius";
    case "fashion":
      return "wardrobe";
    case "real_estate":
      return "aruodas";
    case "services":
      return "paslaugos";
    case "jobs":
      return "cvbankas";
    case "goods":
      return "skelbiu";
    default:
      return "flux";
  }
}

/** @deprecated Use `getVerticalPresentation(verticalPresentationForCategory(category))`. */
export function getChameleonTheme(id: ChameleonThemeId): ChameleonThemeTokens {
  return getVerticalPresentation(themeIdToVerticalId(id));
}

/** @deprecated Use `adaptiveKeyToPresentationId` from `@/lib/vertical-presentation`. */
export function adaptiveKeyToTheme(key: AdaptiveCategoryKey): ChameleonThemeId {
  return verticalIdToThemeId(adaptiveKeyToPresentationId(key));
}

/** @deprecated Use `verticalPresentationForCategory` from `@/lib/vertical-presentation`. */
export function categoryToTheme(category: ListingCategory): ChameleonThemeId {
  return adaptiveKeyToTheme(listingToAdaptiveKey(category));
}

/** @deprecated Use `getPromoteLabelsForCategory` from `@/lib/vertical-presentation`. */
export function getPromoteLabelsForCategory(
  category: ListingCategory
): ChameleonPromoteLabels {
  return getVerticalPromoteLabels(category);
}
