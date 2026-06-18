"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useVauto } from "@/context/VautoContext";
import {
  countUnreadInThread,
  hasUnreadInThread,
} from "@/lib/chat-helpers";

export default function ChatsPage() {
  const { chats, user } = useVauto();

  return (
    <AppShell variant="plain">
      <h1 className="mb-4 text-xl font-bold text-[var(--vauto-text)]">
        Pokalbiai
      </h1>
      <div className="space-y-2">
        {chats.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--vauto-text-muted)]">
            Dar neturite pokalbių. Atidarykite skelbimą ir spauskite „Rašyti
            pardavėjui".
          </p>
        )}
        {chats.map((chat) => {
          const last = chat.messages[chat.messages.length - 1];
          const unread = hasUnreadInThread(chat, user.id);
          const unreadCount = countUnreadInThread(chat, user.id);
          return (
            <Link
              key={chat.id}
              href={`/chats/thread/?id=${chat.id}`}
              className={`card-shadow block rounded-2xl bg-white p-4 transition hover:bg-gray-50 ${
                unread ? "ring-2 ring-[var(--vauto-blue)]/30" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-[var(--vauto-text)]">
                  {chat.listingTitle}
                </p>
                {unread && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-red)] px-1.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-1 text-sm text-[var(--vauto-text-muted)]">
                {last?.text}
              </p>
              {chat.escrowOffered && (
                <span className="mt-2 inline-block rounded-full bg-[var(--vauto-blue)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--vauto-blue)]">
                  Escrow aktyvus
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-[var(--vauto-text-muted)]">
        Parašykite „perku“ arba „tinka“ — AI pasiūlys saugų mokėjimą.
      </p>
    </AppShell>
  );
}
