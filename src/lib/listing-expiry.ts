import type { Listing } from "@/lib/types";

export const LISTING_MAX_AGE_DAYS = 90;

export function defaultExpiresAt(fromIso = new Date().toISOString()): string {
  const d = new Date(fromIso);
  d.setDate(d.getDate() + LISTING_MAX_AGE_DAYS);
  return d.toISOString();
}

export function getExpiresAt(listing: Listing): Date {
  return new Date(listing.expiresAt ?? defaultExpiresAt(listing.createdAt));
}

export function isListingActive(listing: Listing): boolean {
  if (listing.status === "sold") return false;
  return getExpiresAt(listing).getTime() > Date.now();
}

export function daysUntilExpiry(listing: Listing): number {
  return Math.ceil(
    (getExpiresAt(listing).getTime() - Date.now()) / 86_400_000
  );
}

/** Short badge text for profile cards; null if no badge needed */
export function formatExpiryLabel(listing: Listing): string | null {
  const days = daysUntilExpiry(listing);
  if (days < 0) return "Pasibaigęs";
  if (days <= 14) return `Galioja ${days} d.`;
  return null;
}

export function withDefaultExpiry(listing: Listing): Listing {
  return {
    ...listing,
    expiresAt: listing.expiresAt ?? defaultExpiresAt(listing.createdAt),
  };
}
