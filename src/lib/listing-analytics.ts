import type { Listing } from "@/lib/types";

export interface ListingMetrics {
  views: number;
  callClicks: number;
  chatStarts: number;
  saves: number;
  interestScore: number;
}

export function getListingMetrics(listing: Listing): ListingMetrics {
  const views = listing.views ?? 0;
  const callClicks = listing.callClicks ?? 0;
  const chatStarts = listing.chatStarts ?? 0;
  const saves = listing.saveCount ?? 0;
  const contacts = callClicks + chatStarts;
  const interestScore =
    listing.interestScore ??
    (views > 0
      ? Math.min(99, Math.round((contacts / views) * 100 * 3 + saves * 2))
      : 0);

  return { views, callClicks, chatStarts, saves, interestScore };
}

export function bumpListingMetric(
  listing: Listing,
  field: "views" | "callClicks" | "chatStarts" | "saveCount"
): Listing {
  const current =
    field === "saveCount"
      ? (listing.saveCount ?? 0)
      : (listing[field] ?? 0);
  return { ...listing, [field]: current + 1 };
}

export function aggregateSellerMetrics(listings: Listing[]): ListingMetrics {
  const all = listings.map(getListingMetrics);
  const views = all.reduce((s, m) => s + m.views, 0);
  const callClicks = all.reduce((s, m) => s + m.callClicks, 0);
  const chatStarts = all.reduce((s, m) => s + m.chatStarts, 0);
  const saves = all.reduce((s, m) => s + m.saves, 0);
  const contacts = callClicks + chatStarts;
  const interestScore =
    views > 0 ? Math.min(99, Math.round((contacts / views) * 100 * 3)) : 0;
  return { views, callClicks, chatStarts, saves, interestScore };
}
