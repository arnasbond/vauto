const SMS_FALLBACK_MS = 15_000;

export interface SmsFallbackPayload {
  chatId: string;
  messageId: string;
  recipientId: string;
  listingTitle: string;
}

export function buildSmsFallbackMessage(payload: SmsFallbackPayload): string {
  const title = payload.listingTitle.trim() || "skelbimo";
  return `VAUTO: Nauja žinutė dėl „${title}“. Atsakykite: https://www.vauto.lt/pokalbiai/?id=${encodeURIComponent(payload.chatId)}`;
}

/**
 * Demo-only local SMS mock (when API is off). Live delivery is server-side via
 * scheduleChatSmsFallback after notifyIncomingChatMessage.
 */
export function scheduleSmsFallback(
  payload: SmsFallbackPayload,
  isStillUnread: () => boolean,
  onTrigger: (message: string) => void
): () => void {
  const timer = setTimeout(() => {
    if (isStillUnread()) {
      const text = buildSmsFallbackMessage(payload);
      console.info("[VAUTO SMS Fallback]", text);
      onTrigger(text);
    }
  }, SMS_FALLBACK_MS);

  return () => clearTimeout(timer);
}
