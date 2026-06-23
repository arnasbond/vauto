"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";
import { VautoLogo } from "@/components/VautoLogo";
import { useVauto } from "@/context/VautoContext";
import { countUnreadChats } from "@/lib/chat-helpers";

import { useActivePortal } from "@/hooks/useActivePortal";

export function Header() {
  const { user, chats } = useVauto();
  const { ui } = useActivePortal();
  const unreadChats = countUnreadChats(chats, user.id);

  return (
    <header className="flex items-center justify-between">
      <Link href="/">
        <VautoLogo color={ui.accent} dotColor={ui.cta} />
      </Link>

      <div className="flex items-center gap-3">
        <Link
          href="/chats"
          className="relative flex h-10 w-10 items-center justify-center rounded-[14px] border bg-white shadow-sm transition hover:opacity-90"
          style={{ borderColor: ui.border, color: ui.accent }}
          aria-label={
            unreadChats > 0
              ? `Pokalbiai, ${unreadChats} neperskaityti`
              : "Pokalbiai"
          }
        >
          <Bell className="h-[17px] w-[17px]" strokeWidth={1.75} />
          {unreadChats > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--vauto-red)] px-1 text-[9px] font-bold text-white">
              {unreadChats > 9 ? "9+" : unreadChats}
            </span>
          )}
        </Link>
        <Link
          href="/profile"
          className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-[#d7dde5]"
          aria-label="Profilis"
        >
          <Image
            src={user.avatar}
            alt={user.name}
            width={36}
            height={36}
            className="h-full w-full object-cover"
          />
        </Link>
      </div>
    </header>
  );
}
