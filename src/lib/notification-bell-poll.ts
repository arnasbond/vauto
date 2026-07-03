/** Bell polling when Web Push is granted — lazy background sync. */
export const BELL_POLL_MS = 20_000;

/** Aggressive fallback when push permission is denied — reliable in-app layer. */
export const BELL_POLL_DENIED_MS = 8_000;

/** Safety poll when SSE reconnects or misses an event. */
export const CHAT_SAFETY_POLL_MS = 45_000;

/** @deprecated Legacy fast poll — replaced by SSE + CHAT_SAFETY_POLL_MS */
export const CHAT_POLL_VISIBLE_MS = 4_000;

/** Chat sync when tab is in background. */
export const CHAT_POLL_HIDDEN_MS = 12_000;

export function bellPollInterval(pushPermission: NotificationPermission): number {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return BELL_POLL_DENIED_MS;
  }
  return pushPermission === "granted" ? BELL_POLL_MS : BELL_POLL_DENIED_MS;
}

export function chatPollInterval(): number {
  if (typeof document === "undefined") return CHAT_POLL_VISIBLE_MS;
  return document.visibilityState === "hidden"
    ? CHAT_POLL_HIDDEN_MS
    : CHAT_POLL_VISIBLE_MS;
}
