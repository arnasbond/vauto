export type AnalyticsEvent =
  | "listing_view"
  | "listing_call_click"
  | "listing_chat_start"
  | "listing_save"
  | "review_submitted"
  | "listing_marked_sold"
  | "seller_engagement_push"
  | "buddy_speech"
  | "buddy_follow_up";

export function logAnalytics(
  event: AnalyticsEvent,
  payload: Record<string, string | number | boolean | undefined>
) {
  const entry = {
    event,
    ts: new Date().toISOString(),
    ...payload,
  };
  if (typeof window !== "undefined") {
    console.info("[VAUTO Analytics]", entry);
  }
  return entry;
}
