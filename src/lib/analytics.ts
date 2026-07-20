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
  | "chat_message_sent"
  | "conductor_route"
  | "twin_escalate"
  /** Constitution KPI 1+2 */
  | "kpi_listing_flow_start"
  | "kpi_listing_published"
  /** Constitution KPI 3 */
  | "kpi_contact_reask"
  /** Constitution KPI 4 */
  | "kpi_first_response_signal";

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
