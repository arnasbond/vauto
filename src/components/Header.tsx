"use client";

import Image from "next/image";
import Link from "next/link";
import { GuestAvatar } from "@/components/auth/GuestAvatar";
import { VautoLogo } from "@/components/VautoLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useVauto } from "@/context/VautoContext";

import { useActivePortal } from "@/hooks/useActivePortal";

export function Header() {
  const { user, isAuthenticated, openAuthModal } = useVauto();
  const { ui } = useActivePortal();

  const handleProfile = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      openAuthModal("/profile/");
    }
  };

  return (
    <header className="flex items-center justify-between">
      <Link href="/">
        <VautoLogo color={ui.accent} dotColor={ui.cta} />
      </Link>

      <div className="flex items-center gap-3">
        <Link
          href="/apie/"
          className="text-xs font-semibold text-[var(--vauto-text-muted,#6b7280)] transition hover:text-[var(--vauto-teal,#0d9488)]"
        >
          Apie
        </Link>
        <div style={{ borderColor: ui.border, color: ui.accent }}>
          <NotificationBell />
        </div>
        <Link
          href="/profile/"
          onClick={handleProfile}
          className="flex items-center gap-2"
          aria-label={isAuthenticated ? "Profilis" : "Anoniminis naršymas — prisijungti"}
        >
          {isAuthenticated && user.avatar ? (
            <span className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-[#d7dde5]">
              <Image
                src={user.avatar}
                alt={user.name}
                width={36}
                height={36}
                className="h-full w-full object-cover"
              />
            </span>
          ) : (
            <GuestAvatar size="sm" showLabel={false} />
          )}
        </Link>
      </div>
    </header>
  );
}
