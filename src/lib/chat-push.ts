import { formatPrice } from "@/data/mockListings";
import { getListingCoverImage } from "@/lib/listing-image";
import { logWakeEvent } from "@/lib/wake-word-engine";
import { isNativePushDisabled } from "@/lib/mobile-install";
import type { ChatThread, Listing, UserProfile } from "@/lib/types";

export interface ChatPushPayload {
  title: string;
  body: string;
  icon: string;
  image?: string;
  url: string;
  chatId: string;
  listingId: string;
  listingTitle: string;
  senderName: string;
}

export function buildChatDeepLink(chatId: string): string {
  return `/pokalbiai/?id=${encodeURIComponent(chatId)}`;
}

export function buildChatPushPayload(params: {
  chat: ChatThread;
  listing?: Listing;
  sender: Pick<UserProfile, "name" | "companyName">;
  messageText: string;
}): ChatPushPayload {
  const { chat, listing, sender, messageText } = params;
  const priceLabel = listing ? formatPrice(listing.price) : "";
  const listingLine = listing
    ? `${listing.title}${priceLabel ? ` - ${priceLabel}` : ""}`
    : chat.listingTitle;
  const excerpt =
    messageText.length > 90 ? `${messageText.slice(0, 87)}…` : messageText;
  const senderLabel = sender.companyName?.trim() || sender.name || "VAUTO";

  return {
    title: senderLabel,
    body: excerpt,
    icon: "/icon-192.png",
    image: listing ? getListingCoverImage(listing) : undefined,
    url: buildChatDeepLink(chat.id),
    chatId: chat.id,
    listingId: chat.listingId,
    listingTitle: listingLine,
    senderName: senderLabel,
  };
}

export async function dispatchChatPushNotification(
  payload: ChatPushPayload
): Promise<void> {
  if (isNativePushDisabled()) return;
  logWakeEvent("chat_push_dispatch", { chatId: payload.chatId });

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg) {
      await reg.showNotification(payload.title, {
        body: `${payload.listingTitle}\n${payload.body}`,
        icon: payload.icon,
        badge: "/icon-192.png",
        tag: `vauto-chat-${payload.chatId}`,
        renotify: true,
        requireInteraction: false,
        vibrate: [120, 60, 120],
        data: {
          type: "VAUTO_CHAT_MESSAGE",
          url: payload.url,
          chatId: payload.chatId,
          listingId: payload.listingId,
          image: payload.image,
        },
        ...(payload.image ? { image: payload.image } : {}),
      } as NotificationOptions);
      return;
    }
  }

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    const n = new Notification(payload.title, {
      body: `${payload.listingTitle}\n${payload.body}`,
      icon: payload.icon,
      tag: `vauto-chat-${payload.chatId}`,
      data: payload,
    } as NotificationOptions);
    n.onclick = () => {
      window.focus();
      window.location.href = payload.url;
    };
  }
}

/** Permission + Web Push subscription (server endpoint). Call from a user gesture when possible. */
export async function requestChatPushPermission(): Promise<boolean> {
  if (isNativePushDisabled()) return false;
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "denied") return false;

  const { ensureWebPushSubscription } = await import("@/lib/web-push");
  if (Notification.permission === "granted") {
    return ensureWebPushSubscription();
  }
  const result = await Notification.requestPermission();
  if (result !== "granted") return false;
  return ensureWebPushSubscription();
}
