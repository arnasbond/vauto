export interface ListingEditSession {
  listingId: string;
  title: string;
  price: number;
  description: string;
  location: string;
  category: string;
  attributes: Record<string, string | string[] | undefined>;
  startedAt: number;
}

const STORAGE_KEY = "vauto_listing_edit_session";

export function writeListingEditSession(
  session: Omit<ListingEditSession, "startedAt">
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...session, startedAt: Date.now() })
    );
  } catch {
    /* ignore quota */
  }
}

export function readListingEditSession(): ListingEditSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ListingEditSession;
  } catch {
    return null;
  }
}

export function clearListingEditSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function buildListingEditOpener(title: string): string {
  return `Matau, kad norite koreguoti savo skelbimą „${title}". Ką tiksliai norėtumėte pakeisti? Parašykite man laisvu tekstu (pvz., „nuleisk kainą iki 300€"), ir aš iškart atnaujinsiu fone.`;
}
