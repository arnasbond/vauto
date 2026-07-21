import type { Listing, UserProfile } from "@/lib/types";
import { isListingPublicInFeed } from "@/lib/listing-visibility";
import { displayPublicNickname } from "@/lib/profile-display";

const SELLER_NAMESPACE_LABELS: Record<string, string> = {
  auto: "Automobilių",
  nt: "NT",
  job: "Darbo",
  clo: "Drabužių",
  el: "Elektronikos",
  home: "Namų",
  svc: "Paslaugų",
  oth: "Bendrų",
  pnv: "Panevėžio",
  psv: "Pasvalio",
  brz: "Biržų",
};

const ATTR_SELLER_DISPLAY_NAME = "sellerDisplayName";

/** Persist a clean public seller label on the listing at publish time. */
export function withSellerDisplayNameAttribute(
  attributes: Listing["attributes"] | undefined,
  user: Pick<UserProfile, "nickname" | "name" | "firstName" | "lastName">
): NonNullable<Listing["attributes"]> {
  const label = displayPublicNickname(user);
  return {
    ...(attributes ?? {}),
    [ATTR_SELLER_DISPLAY_NAME]: label,
  };
}

export function readSellerDisplayNameFromListing(
  listing: Pick<Listing, "attributes" | "sellerId">
): string | undefined {
  const raw = listing.attributes?.[ATTR_SELLER_DISPLAY_NAME];
  const name = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed || undefined;
}

export function sellerDisplayName(
  sellerId: string,
  opts?: {
    listing?: Pick<Listing, "attributes" | "sellerId">;
    user?: Pick<UserProfile, "id" | "nickname" | "name" | "firstName" | "lastName"> | null;
  }
): string {
  if (opts?.user && opts.user.id === sellerId) {
    return displayPublicNickname(opts.user);
  }
  const fromListing = opts?.listing
    ? readSellerDisplayNameFromListing(opts.listing)
    : undefined;
  if (fromListing) return fromListing;

  if (sellerId === "user-1") return "Jonas K.";
  const parts = sellerId.match(/^seller-([a-z]+)(?:-(\d+))?$/i);
  if (parts) {
    const ns = SELLER_NAMESPACE_LABELS[parts[1]] ?? parts[1];
    const num = parts[2];
    return num ? `${ns} pardavėjas #${num}` : `${ns} pardavėjas`;
  }
  // Never show raw ids like "user 462561412"
  if (/^user[-_]?\d+$/i.test(sellerId) || /^u[-_]?\d+$/i.test(sellerId)) {
    return "Vartotojas";
  }
  if (/^user[-_]/i.test(sellerId)) {
    return "Vartotojas";
  }
  const cleaned = sellerId.replace(/-/g, " ").trim();
  if (!cleaned || /^user\b/i.test(cleaned)) return "Vartotojas";
  return cleaned;
}

export function sellerAvatarUrl(sellerId: string): string {
  let h = 0;
  for (let i = 0; i < sellerId.length; i++) h += sellerId.charCodeAt(i);
  const idx = h % 5;
  const seeds = ["seller-a", "seller-b", "seller-c", "seller-d", "seller-e"];
  return `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&sig=${seeds[idx]}`;
}

export function isListingActive(listing: Listing): boolean {
  return listing.status !== "sold" && !listing.banned;
}

export function isListingVisible(listing: Listing): boolean {
  return isListingPublicInFeed(listing);
}

export function sellerActiveListings(
  listings: Listing[],
  sellerId: string
): Listing[] {
  return listings.filter((l) => l.sellerId === sellerId && isListingActive(l));
}

export function sellerMemberSince(
  listings: Listing[],
  sellerId: string
): string | null {
  const dates = listings
    .filter((l) => l.sellerId === sellerId && l.createdAt)
    .map((l) => l.createdAt)
    .sort();
  if (!dates.length) return null;
  try {
    return new Intl.DateTimeFormat("lt-LT", {
      year: "numeric",
      month: "long",
    }).format(new Date(dates[0]));
  } catch {
    return dates[0];
  }
}

export function uniqueSellerIds(listings: Listing[]): string[] {
  return [...new Set(listings.map((l) => l.sellerId))].sort();
}
