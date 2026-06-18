import type { Listing, ServiceBooking } from "@/lib/types";

/** Deterministic mock metrics from listing id */
export function mockListingMetrics(listing: Listing) {
  let h = 0;
  for (let i = 0; i < listing.id.length; i++) h += listing.id.charCodeAt(i);
  const views = (listing.views ?? (80 + (h % 420))) + (listing.promoted ? 120 : 0);
  const clicks = listing.clicks ?? Math.max(3, Math.floor(views * (0.08 + (h % 10) / 100)));
  const interestScore =
    listing.interestScore ??
    Math.min(99, Math.round((clicks / views) * 100 * 2.5 + (h % 20)));

  return { views, clicks, interestScore };
}

export function mockAggregateAnalytics(listings: Listing[]) {
  const metrics = listings.map(mockListingMetrics);
  return {
    views: metrics.reduce((s, m) => s + m.views, 0),
    clicks: metrics.reduce((s, m) => s + m.clicks, 0),
    interestScore: metrics.length
      ? Math.round(
          metrics.reduce((s, m) => s + m.interestScore, 0) / metrics.length
        )
      : 0,
  };
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
