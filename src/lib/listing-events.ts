import { apiPostListingEvents } from "@/lib/api/listing-events";
import { logAnalytics, type AnalyticsEvent } from "@/lib/analytics";

export type ListingEventType =
  | "view"
  | "contact"
  | "share_story"
  | "price_advice_shown"
  | "price_advice_applied";

function resolveClientAnalyticsEvent(
  type: ListingEventType,
  payload: Record<string, string | number | boolean | undefined>
): AnalyticsEvent | undefined {
  if (type === "view") return "listing_view";
  if (type === "share_story") return "listing_share_story";
  if (type === "price_advice_shown") return "price_advice_shown";
  if (type === "price_advice_applied") return "price_advice_applied";
  if (type === "contact") {
    return String(payload.channel ?? "").toLowerCase() === "chat"
      ? "listing_chat_start"
      : "listing_call_click";
  }
  return undefined;
}

/** Fire-and-forget listing telemetry (Phase 0 / M3). Never blocks UI or AI chat. */
export function trackListingEvent(
  type: ListingEventType,
  payload: Record<string, string | number | boolean | undefined> = {},
  opts?: { skipClientAnalytics?: boolean }
): void {
  if (!opts?.skipClientAnalytics) {
    const analyticsEvent = resolveClientAnalyticsEvent(type, payload);
    if (analyticsEvent) {
      logAnalytics(analyticsEvent, { ...payload, listingEvent: type });
    }
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
  ]);
}
