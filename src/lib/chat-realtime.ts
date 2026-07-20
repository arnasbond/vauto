import type { ChatMessage, ChatThread } from "@/lib/types";

const CHANNEL_NAME = "vauto-chat-realtime-v1";

export type ChatRealtimeEvent =
  | { type: "CHAT_UPSERT"; thread: ChatThread }
  | { type: "MESSAGE_STATUS"; chatId: string; messageId: string; status: ChatMessage["status"] }
  | { type: "CHAT_READ"; chatId: string; viewerId: string; at: string }
  | {
      type: "INCOMING_ALERT";
      chatId: string;
      listingTitle: string;
      preview: string;
      senderId: string;
      /** ISO timestamp of the buyer message that triggered the alert */
      messageSentAt?: string;
    };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function publishChatEvent(event: ChatRealtimeEvent): void {
  getChannel()?.postMessage(event);
}

export function subscribeChatEvents(
  handler: (event: ChatRealtimeEvent) => void
): () => void {
  const ch = getChannel();
  if (!ch) return () => undefined;
  const listener = (e: MessageEvent<ChatRealtimeEvent>) => {
    if (e.data?.type) handler(e.data);
  };
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

export function mergeThreadUpdate(
  threads: ChatThread[],
  updated: ChatThread
): ChatThread[] {
  const idx = threads.findIndex((t) => t.id === updated.id);
  if (idx === -1) return [updated, ...threads];
  const next = [...threads];
  next[idx] = updated;
  return next;
}

export function patchMessageStatus(
  threads: ChatThread[],
  chatId: string,
  messageId: string,
  status: NonNullable<ChatMessage["status"]>
): ChatThread[] {
  const now = new Date().toISOString();
  return threads.map((c) => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      messages: c.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              status,
              deliveredAt: status === "delivered" || status === "read" ? m.deliveredAt ?? now : m.deliveredAt,
              readAt: status === "read" ? now : m.readAt,
            }
          : m
      ),
    };
  });
}

export function applyViewerReadState(
  threads: ChatThread[],
  chatId: string,
  viewerId: string
): ChatThread[] {
  const withIncoming = markIncomingRead(threads, chatId, viewerId);
  const chat = withIncoming.find((c) => c.id === chatId);
  if (!chat) return withIncoming;
  const otherId = chat.buyerId === viewerId ? chat.sellerId : chat.buyerId;
  return markSenderMessagesRead(withIncoming, chatId, otherId);
}

export function markIncomingRead(
  threads: ChatThread[],
  chatId: string,
  viewerId: string
): ChatThread[] {
  const now = new Date().toISOString();
  return threads.map((c) => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      lastReadAt: now,
      messages: c.messages.map((m) =>
        m.senderId !== viewerId && m.senderId !== "vauto-system" && !m.readAt
          ? { ...m, readAt: now }
          : m
      ),
    };
  });
}

export function markSenderMessagesRead(
  threads: ChatThread[],
  chatId: string,
  senderId: string
): ChatThread[] {
  const now = new Date().toISOString();
  return threads.map((c) => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      messages: c.messages.map((m) =>
        m.senderId === senderId && m.status !== "read"
          ? { ...m, status: "read", readAt: now }
          : m
      ),
    };
  });
}
