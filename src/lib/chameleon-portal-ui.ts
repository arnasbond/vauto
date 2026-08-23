import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import { themeIdToVerticalId } from "@/lib/chameleon-themes";
import {
  getVerticalUi,
  type VerticalUiTokens,
} from "@/lib/vertical-presentation";

/**
 * @deprecated Stage 20B.1 — "portal UI" semantics are deprecated.
 *
 * Portal-native palettes (autoplius blue, skelbiu blue, aruodas red, etc.)
 * have been REMOVED. Every vertical now renders with the VAUTO Design System
 * 2.0 emerald identity via `@/lib/vertical-presentation`.
 *
 * This module is a compatibility bridge for existing importers. New code
 * must import `getVerticalUi` / `VerticalUiTokens` from
 * `@/lib/vertical-presentation`.
 */

/** @deprecated Use `VerticalUiTokens` from `@/lib/vertical-presentation`. */
export type PortalUiTokens = VerticalUiTokens;

/** @deprecated Use `VERTICAL_UI` from `@/lib/vertical-presentation`. */
export const PORTAL_UI: Record<ChameleonThemeId, PortalUiTokens> = {
  flux: getVerticalUi("marketplace"),
  autoplius: getVerticalUi("transport"),
  wardrobe: getVerticalUi("fashion"),
  skelbiu: getVerticalUi("goods"),
  aruodas: getVerticalUi("real_estate"),
  paslaugos: getVerticalUi("services"),
  cvbankas: getVerticalUi("jobs"),
};

/** @deprecated Use `getVerticalUi` from `@/lib/vertical-presentation`. */
export function getPortalUi(theme: ChameleonThemeId): PortalUiTokens {
  return getVerticalUi(themeIdToVerticalId(theme));
}
