import {
  getUser,
  markChatSmsFallbackSent,
  shouldSendChatSmsFallback,
} from "../repository.js";
import { isSmsLive, sendSms } from "../services/sms.js";

const DEFAULT_FALLBACK_MS = 300_000;

const skipLogged = new Set<string>();

function appOrigin(): string {
  return (process.env.APP_ORIGIN ?? "https://www.vauto.lt").replace(/\/$/, "");
}

function chatSmsBody(listingTitle: string, chatId: string): string {
  const title = listingTitle.trim() || "skelbimo";
  const url = `${appOrigin()}/pokalbiai/?id=${encodeURIComponent(chatId)}`;
  return `VAUTO: Nauja žinutė dėl „${title}“. Atsakykite: ${url}`;
}

function logSkipOnce(key: string, message: string): void {
  if (skipLogged.has(key)) return;
  skipLogged.add(key);
  console.info(`[chat-sms-fallback] ${message}`);
}

export interface ChatSmsFallbackOpts {
  recipientId: string;
  chatId: string;
  messageId: string;
  listingTitle: string;
  messageCreatedAt?: string;
}

async function runChatSmsFallback(opts: ChatSmsFallbackOpts): Promise<void> {
  const { recipientId, chatId, messageId, listingTitle, messageCreatedAt } = opts;

  const shouldSend = await shouldSendChatSmsFallback(
    chatId,
    recipientId,
    messageId,
    messageCreatedAt
  );
  if (!shouldSend) return;

  if (!isSmsLive()) {
    logSkipOnce("sms-not-live", "skip — SMS not live (set SMS_MODE=live + Twilio/BulkGate)");
    return;
  }

  const user = await getUser(recipientId);
  const phone = user?.phone?.trim();
  if (!phone) {
    logSkipOnce(`no-phone:${recipientId}`, `skip — no phone for user ${recipientId}`);
    return;
  }

  const body = chatSmsBody(listingTitle, chatId);
  const ok = await sendSms(phone, body);
  if (!ok) {
    console.warn(`[chat-sms-fallback] send failed chatId=${chatId} messageId=${messageId}`);
    return;
  }

  await markChatSmsFallbackSent(chatId, messageId);
}

/**
 * After a chat notify: wait CHAT_SMS_FALLBACK_MS (default 5 min), then SMS if still unread.
 * Fire-and-forget — never blocks the chat response path.
 */
export function scheduleChatSmsFallback(opts: ChatSmsFallbackOpts): void {
  const raw = Number(process.env.CHAT_SMS_FALLBACK_MS);
  const delayMs =
    Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_FALLBACK_MS;

  setTimeout(() => {
    void runChatSmsFallback(opts).catch((err) => {
      console.error("[chat-sms-fallback] failed:", err);
    });
  }, delayMs);
}
