const SPINTA_FORCED_KEY = "vauto_wardrobe_spinta_forced";

export function readWardrobeSpintaForced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SPINTA_FORCED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeWardrobeSpintaForced(forced: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (forced) window.sessionStorage.setItem(SPINTA_FORCED_KEY, "1");
    else window.sessionStorage.removeItem(SPINTA_FORCED_KEY);
  } catch {
    /* ignore quota */
  }
}

export const WARDROBE_SPINTA_GREETING =
  "Tavo AI sekretorė pasiruošusi padėti valdyti tavo spintą.";
