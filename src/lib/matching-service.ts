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

export const WANTED_EMPTY_MESSAGE =
  "Šiuo metu tokios prekės neturime. Spustelkite žemiau esantį mygtuką „Įtraukti į pageidavimų sąrašą“ – aš stebėsiu rinką ir informuosiu jus tiesiogiai, kai tik atsiras toks skelbimas.";

export async function registerWanted(deps: RegisterWantedDeps): Promise<boolean> {
  const q = deps.query.trim();
  if (q.length < 3) {
    deps.onError?.("Įveskite bent 3 simbolius paieškai.");
    return false;
  }

  if (!deps.isAuthenticated) {
    deps.openAuthModal("/");
    deps.onError?.("Prisijunkite, kad galėčiau jus informuoti apie naujus skelbimus.");
    return false;
  }

  const ok = await deps.subscribeWishlist(q);
  if (ok) {
    deps.onSuccess?.(
      `Pageidavimas „${q}" įrašytas. Pranešiu, kai atsiras atitinkantis skelbimas.`
    );
    return true;
  }

  deps.onError?.("Nepavyko įrašyti pageidavimo. Bandykite dar kartą.");
  return false;
}
