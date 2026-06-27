export type AnalyticsEvent =
  | "listing_view"
  | "listing_call_click"
  | "listing_chat_start"
  | "listing_save"
  | "review_submitted"
  | "listing_marked_sold"
  | "seller_engagement_push"
  | "buddy_speech"
  | "buddy_follow_up"
  | "wake_word_detected"
  | "checkout_b2c_promote"
  | "checkout_b2b_plan"
  | "checkout_wardrobe_style_boost"
  | "checkout_wardrobe_power"
  | "chat_message_sent";

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
