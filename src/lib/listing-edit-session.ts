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

export const LISTING_EDIT_HOST_PATHS = ["/", "/mano-skelbimai"] as const;

/** Fired after writeListingEditSession — enables in-place edit bootstrap on dashboard. */
export const LISTING_EDIT_SESSION_EVENT = "vauto:listing-edit-session";

export function isListingEditHostPath(pathname: string): boolean {
  const normalized = (pathname || "/").replace(/\/$/, "") || "/";
  return (LISTING_EDIT_HOST_PATHS as readonly string[]).includes(normalized);
}

export function writeListingEditSession(
  session: Omit<ListingEditSession, "startedAt">
): ListingEditSession {
  const payload: ListingEditSession = { ...session, startedAt: Date.now() };
  if (typeof window === "undefined") return payload;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(
      new CustomEvent(LISTING_EDIT_SESSION_EVENT, { detail: payload })
    );
  } catch {
    /* ignore quota */
  }
  return payload;
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
