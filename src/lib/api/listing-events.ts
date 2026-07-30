import { dataFetch } from "@/lib/api/client";
import type { SellerListingAnalytics } from "@/lib/seller-listing-analytics";

export async function apiPostListingEvents(
  events: {
    type: string;
    listingId?: string;
    payload?: Record<string, unknown>;
  }[]
): Promise<boolean> {
  const res = await dataFetch<{ ok: true; inserted?: number }>(
    "/api/analytics/listing-events",
    {
      method: "POST",
      body: JSON.stringify({ events }),
    }
  );
  return res.ok;
}

export async function apiGetSellerListingAnalytics(
  days = 30
): Promise<SellerListingAnalytics | null> {
  const safeDays = Math.min(90, Math.max(1, Math.floor(days)));
  const res = await dataFetch<{
    ok: true;
    metrics: Omit<SellerListingAnalytics, "source">;
  }>(`/api/analytics/listing-events/aggregate?days=${safeDays}`);
  if (!res.ok || !res.data?.metrics) return null;
  return { ...res.data.metrics, source: "server" };
}
