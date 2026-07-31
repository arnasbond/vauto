import type { ChatThread } from "@/lib/types";
import { mergeChatThreads } from "@/lib/chat-realtime";

/** Encode id segments so deterministic chat keys stay URL/DB-safe. */
function encPart(value: string): string {
  return encodeURIComponent(String(value ?? "").trim()).replace(/%/g, ".");
}

/**
 * Canonical listing-bound chat id: one thread per buyer + seller + listing.
 * Legacy `chat-${Date.now()}` ids remain valid; new threads use this form.
 */
export function buildListingBoundChatId(
  buyerId: string,
  sellerId: string,
  listingId: string
): string {
  return `chat_${encPart(buyerId)}__${encPart(sellerId)}__${encPart(listingId)}`;
}

export function listingBoundChatKey(
  buyerId: string,
  sellerId: string,
  listingId: string
): string {
  return `${buyerId}\0${sellerId}\0${listingId}`;
}

export function findListingBoundChat(
  chats: ChatThread[],
  buyerId: string,
  sellerId: string,
  listingId: string
): ChatThread | undefined {
  const canonical = buildListingBoundChatId(buyerId, sellerId, listingId);
  return (
    chats.find((c) => c.id === canonical) ??
    chats.find(
      (c) =>
        c.listingId === listingId &&
        c.buyerId === buyerId &&
        c.sellerId === sellerId
    )
  );
}

/** Collapse accidental duplicates for the same buyer+seller+listing triple. */
export function dedupeListingBoundChats(threads: ChatThread[]): ChatThread[] {
  const byKey = new Map<string, ChatThread>();
  for (const thread of threads) {
    if (!thread.listingId || !thread.buyerId || !thread.sellerId) {
      byKey.set(`id:${thread.id}`, thread);
      continue;
    }
    const key = listingBoundChatKey(
      thread.buyerId,
      thread.sellerId,
      thread.listingId
    );
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, thread);
      continue;
    }
    const canonicalId = buildListingBoundChatId(
      thread.buyerId,
      thread.sellerId,
      thread.listingId
    );
    const merged = mergeChatThreads(prev, thread);
    const preferId =
      prev.id === canonicalId
        ? prev.id
        : thread.id === canonicalId
          ? thread.id
          : prev.messages.length >= thread.messages.length
            ? prev.id
            : thread.id;
    byKey.set(key, { ...merged, id: preferId });
  }
  return Array.from(byKey.values());
}

export function formatChatPrice(price: number): string {
  if (!Number.isFinite(price)) return "";
  return (
    new Intl.NumberFormat("lt-LT", { maximumFractionDigits: 0 }).format(price) +
    " €"
  );
}
