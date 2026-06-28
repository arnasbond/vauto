import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import type { Listing } from "@/lib/types";

/** Griežta Spintos paieškos taisyklė Gemini system promptui (tik /fashion kontekste). */
export const SPINTA_SEARCH_SYSTEM_RULE = `
GRIEŽTA SPINTOS TAISYKLĖ: Vartotojas yra VAUTO Spintoje (drabužių ir batų portalas).
category VISADA turi būti "Drabužiai" (listingCategory: clothing).
NIEKADA negrąžink Auto, Elektronika, Namai, NT, Paslaugos, Darbas kategorijų.
Paieška TIK drabužiai, batai, avalynė, apranga, aksesuarai — jokios padangos, automobilių dalių ar kitų prekių.`;

/** Auto-nukreipimas į Spintą iš paieškos/pardavimo intencijos — išjungtas (3 mazgų sistema). */
export function isWardrobePortalQuery(query: string): boolean {
  void query;
  return false;
}

/** Ar kabinetas turi persijungti į „Mano Spinta“ — tik rankinis /fashion ar profilio perjungimas. */
export function isWardrobeChameleonActive(params: {
  chameleonTheme: ChameleonThemeId;
  detectedAdaptiveKey: AdaptiveCategoryKey | null;
  searchQuery?: string;
  listings?: Listing[];
  spintaForced?: boolean;
}): boolean {
  if (params.spintaForced) return true;
  if (params.chameleonTheme === "wardrobe") return true;
  return false;
}
