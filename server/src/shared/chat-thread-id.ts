/** Mirror of src/lib/chat-thread-id.ts — keep encoding identical. */

function encPart(value: string): string {
  return encodeURIComponent(String(value ?? "").trim()).replace(/%/g, ".");
}

export function buildListingBoundChatId(
  buyerId: string,
  sellerId: string,
  listingId: string
): string {
  return `chat_${encPart(buyerId)}__${encPart(sellerId)}__${encPart(listingId)}`;
}
