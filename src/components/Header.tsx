"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";
import { VautoLogo } from "@/components/VautoLogo";
import { useVauto } from "@/context/VautoContext";

export function Header() {
  const { user } = useVauto();

  return (
    <header className="flex items-center justify-between">
      <Link href="/">
        <VautoLogo />
      </Link>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="relative text-white/90 transition hover:text-white"
          aria-label="Pranešimai"
        >
          <Bell className="h-6 w-6" strokeWidth={1.75} />
        </button>
        <Link
          href="/profile"
          className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-white/40"
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
