import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import type { Listing } from "@/lib/types";

/** Ar kabinetas turi persijungti į „Mano Spinta“ (tik drabužių chameleon sluoksniui). */
export function isWardrobeChameleonActive(params: {
  chameleonTheme: ChameleonThemeId;
  detectedAdaptiveKey: AdaptiveCategoryKey | null;
  searchQuery?: string;
  listings?: Listing[];
}): boolean {
  if (params.chameleonTheme === "wardrobe") return true;
  if (params.detectedAdaptiveKey === "clothing") return true;

  const q = params.searchQuery?.trim();
  if (q && portalExperienceForQuery(q).theme === "wardrobe") return true;

  const listings = params.listings ?? [];
  if (listings.length === 0) return false;

  const active = listings.filter((l) => l.status !== "sold");
  const clothingActive = active.filter((l) => l.category === "clothing");
  if (clothingActive.length === 0) return false;
  if (active.length === 0) return clothingActive.length > 0;

  return clothingActive.length / active.length >= 0.5;
}
