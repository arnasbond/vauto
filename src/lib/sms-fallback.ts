const SMS_FALLBACK_MS = 15_000;

export interface SmsFallbackPayload {
  chatId: string;
  messageId: string;
  recipientId: string;
  listingTitle: string;
}

export function buildSmsFallbackMessage(payload: SmsFallbackPayload): string {
  const shortId = payload.chatId.replace("chat-", "").slice(-6);
  return `VAUTO: Gavote naują žinutę dėl skelbimo „${payload.listingTitle}"! Spauskite nuorodą, kad atsakytumėte: vauto.com/chats/${shortId}`;
}

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
