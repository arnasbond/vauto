"use client";

import Link from "next/link";
import {
  countUnreadInThread,
  hasUnreadInThread,
} from "@/lib/chat-helpers";
import type { ChatThread } from "@/lib/types";
import { cn } from "@/lib/cn";

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
        const roleLabel =
          chat.buyerId === userId ? "Pardavėjas" : "Pirkėjas";
        const active = selectedChatId === chat.id;

        const cardClass = cn(
          "block rounded-2xl border bg-white p-4 shadow-sm transition hover:border-slate-300",
          active
            ? "border-orange-300 ring-2 ring-orange-200/60"
            : "border-slate-200/80",
          unread && !active && "ring-2 ring-[var(--vauto-teal)]/20"
        );

        const inner = (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {chat.listingTitle}
                </p>
                <p className="text-[10px] text-slate-500">{roleLabel}</p>
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
          </>
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
