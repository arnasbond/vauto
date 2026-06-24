"use client";

import Link from "next/link";
import { LogIn, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import {
  countUnreadInThread,
  hasUnreadInThread,
} from "@/lib/chat-helpers";

export default function ChatsPage() {
  const { openAuthModal } = useAuth();
  const { chats, user, isAuthenticated, authHydrated } = useVauto();

  const myChats = chats.filter(
    (c) => c.buyerId === user.id || c.sellerId === user.id
  );

  if (!authHydrated) {
    return (
      <AppShell>
        <p className="py-16 text-center text-sm text-[var(--vauto-text-muted)]">
          Kraunama…
        </p>
      </AppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppShell>
        <div className="flex min-h-[50dvh] flex-col items-center justify-center px-6 text-center">
          <MessageCircle className="mb-4 h-12 w-12 text-[var(--flux-teal)]" />
          <h1 className="text-xl font-bold text-white">Pokalbiai</h1>
          <p className="mt-2 text-sm text-[var(--vauto-text-muted)]">
            Prisijunkite, kad galėtumėte rašyti pardavėjams ir sekti pokalbius.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("/chats")}
            className="mt-6 flex items-center gap-2 rounded-2xl bg-[var(--flux-teal)] px-6 py-3 text-sm font-semibold text-[var(--flux-bg)]"
          >
            <LogIn className="h-4 w-4" />
            Prisijungti
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-4 font-display text-xl font-bold text-white">
        Pokalbiai
      </h1>
      <div className="space-y-2">
        {myChats.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--vauto-text-muted)]">
            Dar neturite pokalbių. Atidarykite skelbimą ir spauskite „Rašyti“.
          </p>
        )}
        {myChats.map((chat) => {
          const last = chat.messages[chat.messages.length - 1];
          const unread = hasUnreadInThread(chat, user.id);
          const unreadCount = countUnreadInThread(chat, user.id);
          const roleLabel =
            chat.buyerId === user.id ? "Pardavėjas" : "Pirkėjas";
          return (
            <Link
              key={chat.id}
              href={`/chats/thread/?id=${chat.id}`}
              className={`vauto-glass-card block rounded-2xl p-4 transition hover:border-white/15 ${
                unread ? "ring-2 ring-[var(--flux-teal)]/30" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">{chat.listingTitle}</p>
                  <p className="text-[10px] text-white/40">{roleLabel}</p>
                </div>
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
                <span className="mt-2 inline-block rounded-full bg-[var(--flux-teal)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--flux-teal)]">
                  Escrow aktyvus
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-white/30">
        Parašykite „perku“ arba „tinka“ — AI pasiūlys saugų mokėjimą.
      </p>
    </AppShell>
  );
}
