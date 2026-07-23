"use client";

import Link from "next/link";
import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Plus } from "lucide-react";
import { UserProfileDropdown } from "@/components/layout/UserProfileDropdown";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { cn } from "@/lib/cn";

export function DesktopHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { resetHomeAgentSession, beginFreshListingChatSession } = useVautoAgent();
  const skelbimaiActive = pathname === "/" || pathname === "";

  const handleHomeNav = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      resetHomeAgentSession();
      if (!skelbimaiActive) {
        router.push("/");
      }
    },
    [resetHomeAgentSession, router, skelbimaiActive]
  );

  const handleAddListing = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      beginFreshListingChatSession();
      router.push("/add/");
    },
    [beginFreshListingChatSession, router]
  );

  return (
    <header className="desktop-header sticky top-0 z-40 border-b border-[var(--anonser-border)] bg-[var(--anonser-header-bg)]/95 shadow-[0_1px_0_rgba(15,23,42,0.05)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[var(--anonser-desktop-max)] items-center gap-6 px-6">
        <Link
          href="/"
          onClick={handleHomeNav}
          className="shrink-0 font-display text-xl font-bold tracking-tight text-[var(--anonser-text)] transition hover:text-[var(--anonser-primary)]"
          aria-label="VAUTO pradžia"
        >
          VAUTO
        </Link>

        <nav className="flex flex-1 justify-center" aria-label="Pagrindinė navigacija">
          <Link
            href="/"
            onClick={handleHomeNav}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
              skelbimaiActive
                ? "bg-[var(--anonser-primary-soft)] text-[var(--anonser-primary)] shadow-sm"
                : "text-[var(--anonser-text-muted)] hover:bg-[var(--anonser-surface-muted)] hover:text-[var(--anonser-text)]"
            )}
          >
            <Home className="h-4 w-4" aria-hidden />
            Skelbimai
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/add/"
            onClick={handleAddListing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--anonser-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Įdėti
          </Link>
          <UserProfileDropdown variant="desktop" />
        </div>
      </div>
    </header>
  );
}
