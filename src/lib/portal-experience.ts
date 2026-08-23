import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import { themeIdToVerticalId } from "@/lib/chameleon-themes";
import {
  verticalExperienceForQuery as verticalExperienceForQueryNative,
  allVerticalExperiences as allVerticalExperiencesNative,
  verticalShortLabel as verticalShortLabelNative,
  type VerticalExperience,
} from "@/lib/vertical-presentation";

/**
 * @deprecated Stage 20B.1 — "portal experience" semantics are deprecated.
 *
 * Query → vertical adaptation logic is preserved in
 * `@/lib/vertical-presentation` (see `verticalExperienceForQuery`).
 * Portal imitation naming (Skelbiu, Aruodas, CVbankas…) is removed; every
 * vertical is presented under the single VAUTO DS 2.0 identity.
 *
 * This module is a compatibility bridge for existing importers.
 */

/** @deprecated Use `VerticalExperience` from `@/lib/vertical-presentation`. */
export type PortalExperience = VerticalExperience;

/** @deprecated Use `verticalExperienceForQuery` from `@/lib/vertical-presentation`. */
export function portalExperienceForQuery(query: string): PortalExperience {
  return verticalExperienceForQueryNative(query);
}

/** @deprecated Use `allVerticalExperiences` from `@/lib/vertical-presentation`. */
export function allPortalExperiences(): PortalExperience[] {
  return allVerticalExperiencesNative();
}

/** @deprecated Use `verticalShortLabel` from `@/lib/vertical-presentation`. */
export function portalShortLabel(theme: ChameleonThemeId): string {
  return verticalShortLabelNative(themeIdToVerticalId(theme));
}
