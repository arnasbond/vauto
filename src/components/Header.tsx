"use client";

import Image from "next/image";
import Link from "next/link";
import { GuestAvatar } from "@/components/auth/GuestAvatar";
import { VautoLogo } from "@/components/VautoLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useVauto } from "@/context/VautoContext";

export function Header() {
  const { user, isAuthenticated, openAuthModal } = useVauto();

  const handleProfile = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      openAuthModal("/profile/");
    }
  };

  return (
    <header className="vauto-app-header flex items-center justify-between gap-3 py-1">
      <Link href="/" className="min-w-0 shrink" aria-label="VAUTO pradžia">
        <VautoLogo variant="brand" markSize="sm" />
      </Link>

      <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <Link href="/apie/" className="vauto-header-link text-xs font-semibold">
          Apie
        </Link>
        <div className="vauto-header-icon-ring">
          <NotificationBell />
        </div>
        <Link
          href="/profile/"
          onClick={handleProfile}
          className="flex items-center gap-2"
          aria-label={isAuthenticated ? "Profilis" : "Anoniminis naršymas — prisijungti"}
        >
          {isAuthenticated && user.avatar ? (
            <span className="vauto-header-avatar h-9 w-9 overflow-hidden rounded-full ring-2">
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
