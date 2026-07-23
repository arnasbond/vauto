"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { VautoLogo } from "@/components/VautoLogo";
import { UserProfileDropdown } from "@/components/layout/UserProfileDropdown";
import { useActivePortal } from "@/hooks/useActivePortal";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { cn } from "@/lib/cn";

export function Header() {
  const { ui } = useActivePortal();
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
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <Link
        href="/"
        onClick={handleHomeNav}
        className="justify-self-start"
        aria-label="VAUTO pradžia"
      >
        <VautoLogo color={ui.accent} dotColor={ui.cta} />
      </Link>

      <Link
        href="/"
        onClick={handleHomeNav}
        className={cn(
          "justify-self-center rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition",
          skelbimaiActive
            ? "bg-[var(--vauto-primary-soft,#e0f2fe)] text-[var(--vauto-primary,#0891b2)]"
            : "text-[var(--vauto-text-muted,#6b7280)] hover:text-[var(--vauto-primary,#0891b2)]"
        )}
      >
        Skelbimai
      </Link>

      <div className="flex items-center justify-end gap-2 justify-self-end">
        <Link
          href="/add/"
          onClick={handleAddListing}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--vauto-primary,#0891b2)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-95"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Įdėti
        </Link>
        <UserProfileDropdown variant="mobile" />
      </div>
    </header>
  );
}
