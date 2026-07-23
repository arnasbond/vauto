/**
 * Wanted-listing / pageidavimų sąrašo registracija.
 * Kliento sluoksnis virš PushAlertsContext.subscribeWishlist.
 */

export interface RegisterWantedDeps {
  query: string;
  isAuthenticated: boolean;
  openAuthModal: (redirect?: string) => void;
  subscribeWishlist: (query: string) => Promise<boolean>;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export const EMPTY_SEARCH_WISHLIST_CHIP = "🔔 Įtraukti į pageidavimų sąrašą";

/** Greiti atsakymai kai paieška grąžina 0 rezultatų (≥2 kad chip juosta visada matytųsi). */
export const EMPTY_SEARCH_QUICK_REPLIES = [
  EMPTY_SEARCH_WISHLIST_CHIP,
  "Platesnė paieška",
] as const;

export const WANTED_AUTH_MESSAGE =
  "Prisijunkite arba užsiregistruokite, kad gautumėte pranešimą el. paštu / pranešimu apie naują prekę.";

export const WANTED_SAVED_MESSAGE =
  "Užklausa išsaugota! Informuosime jus apie naujus skelbimus.";

export function buildEmptySearchWishlistMessage(searchTerm?: string): string {
  const q = searchTerm?.trim() || "jūsų užklausą";
  return (
    `Šiuo metu skelbimų pagal užklausą „${q}" neradome.\n` +
    `Ar norite įtraukti šią paiešką į Pageidavimų sąrašą? Kai tik atsiras panaši prekė, atsiųsime jums pranešimą!`
  );
}

/** @deprecated use buildEmptySearchWishlistMessage */
export const WANTED_EMPTY_MESSAGE = buildEmptySearchWishlistMessage();

export function isEmptySearchWishlistCta(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    t.includes("pageidavimų sąrašą") ||
    t.includes("pageidavimu sarasa") ||
    t.includes("įtraukti šią paiešką") ||
    t.includes("itraukti sia paieska")
  );
}

export async function registerWanted(deps: RegisterWantedDeps): Promise<boolean> {
  const q = deps.query.trim();
  if (q.length < 3) {
    deps.onError?.("Įveskite bent 3 simbolius paieškai.");
    return false;
  }

  if (!deps.isAuthenticated) {
    deps.openAuthModal("/");
    deps.onError?.(WANTED_AUTH_MESSAGE);
    return false;
  }

  const ok = await deps.subscribeWishlist(q);
  if (ok) {
    deps.onSuccess?.(WANTED_SAVED_MESSAGE);
    return true;
  }

  deps.onError?.("Nepavyko įrašyti pageidavimo. Bandykite dar kartą.");
  return false;
}
