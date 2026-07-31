"use client";

import Link from "next/link";
import {
  countUnreadInThread,
  hasUnreadInThread,
} from "@/lib/chat-helpers";
import { formatChatPrice } from "@/lib/chat-thread-id";
import { resolveSellerDisplayName } from "@/lib/user-trust-score";
import { sellerAvatarUrl, sellerDisplayName } from "@/lib/seller-display";
import type { ChatThread } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useVauto } from "@/context/VautoContext";

interface ChatsListPanelProps {
  chats: ChatThread[];
  userId: string;
  selectedChatId?: string | null;
  /** Desktop split — use client navigation without full page change */
  linkPrefix?: string;
  onSelectChat?: (chatId: string) => void;
  className?: string;
}

export function ChatsListPanel({
  chats,
  userId,
  selectedChatId,
  linkPrefix = "/pokalbiai/?id=",
  onSelectChat,
  className,
}: ChatsListPanelProps) {
  const { listings } = useVauto();

  if (chats.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        Dar neturite pokalbių. Atidarykite skelbimą ir spauskite „Rašyti“.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {chats.map((chat) => {
        const last = chat.messages[chat.messages.length - 1];
        const unread = hasUnreadInThread(chat, userId);
        const unreadCount = countUnreadInThread(chat, userId);
        const isBuyer = chat.buyerId === userId;
        const peerId = isBuyer ? chat.sellerId : chat.buyerId;
        const listing = listings.find((l) => l.id === chat.listingId);
        const thumb = listing?.images?.[0]?.trim() || "";
        const priceLabel = listing ? formatChatPrice(listing.price) : "";
        const peerLabel = isBuyer
          ? sellerDisplayName(peerId, { listing }) ||
            resolveSellerDisplayName(peerId, listings)
          : "Pirkėjas";
        const peerAvatar = sellerAvatarUrl(peerId);
        const active = selectedChatId === chat.id;

        const cardClass = cn(
          "block rounded-2xl border bg-white p-3 shadow-sm transition hover:border-slate-300",
          active
            ? "border-orange-300 ring-2 ring-orange-200/60"
            : "border-slate-200/80",
          unread && !active && "ring-2 ring-[var(--vauto-teal)]/20"
        );

        const inner = (
          <div className="flex items-start gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  className="h-full w-full object-cover"
                  width={56}
                  height={56}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                  —
                </span>
              )}
              <div className="absolute -bottom-1 -right-1 h-6 w-6 overflow-hidden rounded-full border-2 border-white bg-slate-200">
                {peerAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={peerAvatar}
                    alt=""
                    className="h-full w-full object-cover"
                    width={24}
                    height={24}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-slate-500">
                    {peerLabel.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {listing?.title || chat.listingTitle}
                  </p>
                  <p className="truncate text-xs font-medium text-slate-700">
                    {priceLabel || "Kaina nenurodyta"}
                    <span className="font-normal text-slate-500">
                      {" "}
                      · {peerLabel}
                    </span>
                  </p>
                </div>
                {unread && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-red)] px-1.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                {last?.text}
              </p>
              {chat.escrowOffered && (
                <span className="mt-2 inline-block rounded-full bg-[var(--vauto-teal)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--vauto-teal)]">
                  Escrow aktyvus
                </span>
              )}
            </div>
          </div>
        );

        if (onSelectChat) {
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelectChat(chat.id)}
              className={cn(cardClass, "w-full text-left")}
            >
              {inner}
            </button>
          );
        }

        return (
          <Link key={chat.id} href={`${linkPrefix}${chat.id}`} className={cardClass}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
