/** Shared user-behavior event types (client → Gemini agent context). */
export type UserBehaviorActionType =
  | "page_view"
  | "filter_change"
  | "view_mode_change"
  | "listing_view"
  | "listing_dwell"
  | "negotiate_click"
  | "search_submit"
  | "search_empty"
  | "theme_change"
  | "spinta_enter"
  | "agent_message"
  | "agent_action"
  | "conductor_publish"
  | "conductor_route"
  | "seller_photo_category_mismatch";

export interface UserBehaviorEvent {
  id: string;
  type: UserBehaviorActionType;
  at: number;
  payload: Record<string, unknown>;
}

export const USER_BEHAVIOR_MAX_EVENTS = 15;
