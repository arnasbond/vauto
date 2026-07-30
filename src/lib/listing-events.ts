import { apiPostListingEvents } from "@/lib/api/listing-events";
import { logAnalytics, type AnalyticsEvent } from "@/lib/analytics";

export type ListingEventType =
  | "view"
  | "contact"
  | "share_story"
  | "price_advice_shown"
  | "price_advice_applied";

/** Fire-and-forget listing telemetry (Phase 0). Never blocks UI or AI chat. */
export function trackListingEvent(
  type: ListingEventType,
  payload: Record<string, string | number | boolean | undefined> = {}
): void {
  const analyticsMap: Partial<Record<ListingEventType, AnalyticsEvent>> = {
    price_advice_shown: "price_advice_shown",
    price_advice_applied: "price_advice_applied",
    view: "listing_view",
    contact: "listing_call_click",
    share_story: "listing_share_story",
  };
  const analyticsEvent = analyticsMap[type];
  if (analyticsEvent) {
    logAnalytics(analyticsEvent, { ...payload, listingEvent: type });
  }

  void apiPostListingEvents([
    {
      type,
      listingId:
        typeof payload.listingId === "string" ? payload.listingId : undefined,
      payload: Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== undefined)
      ),
    },
  ]).catch(() => undefined);
}
