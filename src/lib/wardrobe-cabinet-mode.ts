import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import type { Listing } from "@/lib/types";

/** Griežta Spintos paieškos taisyklė Gemini system promptui. */
export const SPINTA_SEARCH_SYSTEM_RULE = `
GRIEŽTA SPINTOS TAISYKLĖ: Vartotojas yra VAUTO Spintoje (drabužių ir batų portalas).
category VISADA turi būti "Drabužiai" (listingCategory: clothing).
NIEKADA negrąžink Auto, Elektronika, Namai, NT, Paslaugos, Darbas kategorijų.
Paieška TIK drabužiai, batai, avalynė, apranga, aksesuarai — jokios padangos, automobilių dalių ar kitų prekių.`;

export function isWardrobePortalQuery(query: string): boolean {
  return portalExperienceForQuery(query).theme === "wardrobe";
}

/** Ar kabinetas turi persijungti į „Mano Spinta“ (tik drabužių chameleon sluoksniui). */
export function isWardrobeChameleonActive(params: {
  chameleonTheme: ChameleonThemeId;
  detectedAdaptiveKey: AdaptiveCategoryKey | null;
  searchQuery?: string;
  listings?: Listing[];
  /** Rankinis „VAUTO Spinta“ perjungimas (profilis / fashion demo) */
  spintaForced?: boolean;
}): boolean {
  if (params.spintaForced) return true;
  if (params.chameleonTheme === "wardrobe") return true;
  if (params.detectedAdaptiveKey === "clothing") return true;

  const q = params.searchQuery?.trim();
  if (q && isWardrobePortalQuery(q)) return true;

  const listings = params.listings ?? [];
  if (listings.length === 0) return false;

  const active = listings.filter((l) => l.status !== "sold");
  const clothingActive = active.filter((l) => l.category === "clothing");
  if (clothingActive.length === 0) return false;
  if (active.length === 0) return clothingActive.length > 0;

  return clothingActive.length / active.length >= 0.5;
}
