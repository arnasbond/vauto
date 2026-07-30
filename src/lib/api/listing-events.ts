import { dataFetch } from "@/lib/api/client";

export async function apiPostListingEvents(
  events: {
    type: string;
    listingId?: string;
    payload?: Record<string, unknown>;
  }[]
): Promise<{ ok: true } | null> {
  try {
    return await dataFetch<{ ok: true }>("/api/analytics/listing-events", {
      method: "POST",
      body: JSON.stringify({ events }),
    });
  } catch {
    return null;
  }
}
