import type { Listing, ServiceBooking } from "@/lib/types";
import { aggregateSellerMetrics, getListingMetrics } from "@/lib/listing-analytics";

/** Real metrics from listing fields, with light seed fallback */
export function mockListingMetrics(listing: Listing) {
  const m = getListingMetrics(listing);
  if (m.views > 0) return m;
  let h = 0;
  for (let i = 0; i < listing.id.length; i++) h += listing.id.charCodeAt(i);
  const views = 80 + (h % 420) + (listing.promoted ? 120 : 0);
  const callClicks = Math.max(1, Math.floor(views * 0.08));
  const chatStarts = Math.max(0, Math.floor(views * 0.04));
  const saves = Math.max(0, Math.floor(views * 0.03));
  const interestScore = Math.min(99, Math.round(((callClicks + chatStarts) / views) * 100 * 3));
  return { views, callClicks, chatStarts, saves, interestScore };
}

export function mockAggregateAnalytics(listings: Listing[]) {
  return aggregateSellerMetrics(listings);
}

export function mockServiceBookings(): ServiceBooking[] {
  const today = new Date();
  const d = (offset: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + offset);
    return x.toISOString().slice(0, 10);
  };

  return [
    {
      id: "bk-1",
      clientName: "Marius P.",
      service: "Automobilio diagnostika",
      date: d(1),
      time: "10:00",
    },
    {
      id: "bk-2",
      clientName: "Eglė K.",
      service: "Žolės pjovimas",
      date: d(1),
      time: "14:30",
    },
    {
      id: "bk-3",
      clientName: "Tomas R.",
      service: "Elektros instaliacija",
      date: d(3),
      time: "09:00",
    },
    {
      id: "bk-4",
      clientName: "Indrė S.",
      service: "Baldų surinkimas",
      date: d(5),
      time: "16:00",
    },
  ];
}
