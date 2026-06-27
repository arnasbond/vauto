import type { ChatThread, EscrowTransaction, Listing } from "@/lib/types";

export interface WardrobeDealView {
  chatId: string;
  listingId: string;
  listingTitle: string;
  role: "buyer" | "seller";
  escrow: EscrowTransaction;
}

const ACTIVE_ESCROW: EscrowTransaction["status"][] = [
  "offered",
  "paying",
  "paid",
  "label_sent",
  "shipped",
  "delivered",
];

export function collectWardrobeDeals(
  chats: ChatThread[],
  listings: Listing[],
  userId: string
): WardrobeDealView[] {
  const listingById = new Map(listings.map((l) => [l.id, l]));
  const out: WardrobeDealView[] = [];

  for (const chat of chats) {
    const escrow = chat.escrow;
    if (!escrow || !ACTIVE_ESCROW.includes(escrow.status)) continue;

    const listing = listingById.get(chat.listingId);
    if (listing?.category !== "clothing") continue;

    const isBuyer = chat.buyerId === userId;
    const isSeller = chat.sellerId === userId;
    if (!isBuyer && !isSeller) continue;

    out.push({
      chatId: chat.id,
      listingId: chat.listingId,
      listingTitle: chat.listingTitle || listing.title,
      role: isBuyer ? "buyer" : "seller",
      escrow,
    });
  }

  return out.sort(
    (a, b) =>
      new Date(b.escrow.updatedAt).getTime() - new Date(a.escrow.updatedAt).getTime()
  );
}

export function countActiveShipments(deals: WardrobeDealView[]): number {
  return deals.filter((d) =>
    ["label_sent", "shipped", "delivered"].includes(d.escrow.status)
  ).length;
}

export function countExpressEscrowTimers(deals: WardrobeDealView[]): number {
  return deals.filter((d) => d.escrow.expressEscrow24h && d.escrow.status === "delivered")
    .length;
}
