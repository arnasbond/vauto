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

const STATUS_RANK: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

function preferStatus(
  a?: ChatMessage["status"],
  b?: ChatMessage["status"]
): ChatMessage["status"] | undefined {
  if (!a) return b;
  if (!b) return a;
  return (STATUS_RANK[b] ?? 0) >= (STATUS_RANK[a] ?? 0) ? b : a;
}

function preferIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) >= Date.parse(a) ? b : a;
}

/** Union local optimistic messages with the remote server truth by message id. */
export function mergeChatThreads(local: ChatThread, remote: ChatThread): ChatThread {
  const byId = new Map<string, ChatMessage>();
  for (const m of local.messages) byId.set(m.id, m);
  for (const m of remote.messages) {
    const prev = byId.get(m.id);
    if (!prev) {
      byId.set(m.id, m);
      continue;
    }
    byId.set(m.id, {
      ...prev,
      ...m,
      status: preferStatus(prev.status, m.status),
      deliveredAt: preferIso(prev.deliveredAt, m.deliveredAt),
      readAt: preferIso(prev.readAt, m.readAt),
    });
  }

  const messages = Array.from(byId.values()).sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );

  return {
    ...local,
    ...remote,
    messages,
    escrowOffered: Boolean(remote.escrowOffered || local.escrowOffered),
    escrow: remote.escrow ?? local.escrow,
    negotiationTwin: remote.negotiationTwin ?? local.negotiationTwin,
    lastReadAt: preferIso(local.lastReadAt, remote.lastReadAt),
    magicMirrorNote: remote.magicMirrorNote ?? local.magicMirrorNote,
  };
}

/** True when remote carries new message ids or newer delivery/read state. */
export function remoteThreadHasUpdates(
  local: ChatThread | undefined,
  remote: ChatThread
): boolean {
  if (!local) return true;
  const localIds = new Set(local.messages.map((m) => m.id));
  if (remote.messages.some((m) => !localIds.has(m.id))) return true;
  if (remote.messages.length !== local.messages.length) return true;
  if (remote.escrowOffered !== local.escrowOffered) return true;
  if (remote.lastReadAt && remote.lastReadAt !== local.lastReadAt) return true;

  const remoteById = new Map(remote.messages.map((m) => [m.id, m]));
  for (const m of local.messages) {
    const r = remoteById.get(m.id);
    if (!r) continue;
    if ((STATUS_RANK[r.status ?? ""] ?? 0) > (STATUS_RANK[m.status ?? ""] ?? 0)) {
      return true;
    }
    if (r.readAt && r.readAt !== m.readAt) return true;
  }
  return false;
}
