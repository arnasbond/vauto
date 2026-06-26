import type { Listing } from "@/lib/types";
import { isListingPublicInFeed } from "@/lib/listing-visibility";

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

export function sellerDisplayName(sellerId: string): string {
  if (sellerId === "user-1") return "Jonas K.";
  const parts = sellerId.match(/^seller-([a-z]+)(?:-(\d+))?$/i);
  if (parts) {
    const ns = SELLER_NAMESPACE_LABELS[parts[1]] ?? parts[1];
    const num = parts[2];
    return num ? `${ns} pardavėjas #${num}` : `${ns} pardavėjas`;
  }
  return sellerId.replace(/-/g, " ");
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
