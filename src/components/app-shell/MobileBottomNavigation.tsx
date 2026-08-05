"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  MessageCircle,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useChat } from "@/context/ChatContext";
import { countUnreadChats } from "@/lib/chat-helpers";
import { cn } from "@/lib/cn";
import { resolveMessagesHref } from "./nav-config";

type Tab = {
  id: string;
  label: string;
  href?: string;
  icon: typeof Home;
  action?: "add";
};

export function MobileBottomNavigation() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const {
    requireAuthForListing,
    isAuthenticated,
    openAuthModal,
    user,
  } = useVauto();
  const { resetHomeAgentSession, openAiSellerListingChat } = useVautoAgent();
  const { chats } = useChat();
  const unreadChats = isAuthenticated ? countUnreadChats(chats, user.id) : 0;

  const messagesHref = resolveMessagesHref();

  const tabs: Tab[] = useMemo(
    () => [
      { id: "home", label: "Pradžia", href: "/", icon: Home },
      { id: "search", label: "Paieška", href: "/search/", icon: Search },
      { id: "add", label: "Įdėti", icon: Plus, action: "add" },
      {
        id: "chats",
        label: "Pokalbiai",
        href: messagesHref,
        icon: MessageCircle,
      },
      {
        id: "profile",
        label: "Profilis",
        href: "/profile/",
        icon: UserRound,
      },
    ],
    [messagesHref]
  );

  const handleHome = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resetHomeAgentSession();
      if (pathname !== "/" && pathname !== "") router.push("/");
    },
    [pathname, resetHomeAgentSession, router]
  );

  const handleAdd = useCallback(() => {
    if (!requireAuthForListing("/")) return;
    void openAiSellerListingChat({ navigateHome: true });
  }, [openAiSellerListingChat, requireAuthForListing]);

  const isActive = (tab: Tab) => {
    if (tab.action === "add") return false;
    if (!tab.href) return false;
    if (tab.href === "/") return pathname === "/" || pathname === "";
    if (tab.href.startsWith("/messages") || tab.href.startsWith("/chats")) {
      return (
        pathname.startsWith("/messages") ||
        pathname.startsWith("/chats") ||
        pathname.startsWith("/pokalbiai")
      );
    }
    if (tab.href.startsWith("/profile")) return pathname.startsWith("/profile");
    if (tab.href.startsWith("/search")) return pathname.startsWith("/search");
    return pathname === tab.href || pathname.startsWith(tab.href);
  };

  return (
    <nav
      data-mobile-bottom-nav
      aria-label="Pagrindinė navigacija"
      className={cn(
        "ds-glass fixed inset-x-0 bottom-0 z-50 border-t border-[var(--ds-border-subtle,var(--vauto-border))]",
        "pb-[max(0.35rem,env(safe-area-inset-bottom))] md:hidden"
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1 pt-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab);
          const isAdd = tab.action === "add";

          if (isAdd) {
            return (
              <li key={tab.id} className="flex flex-1 justify-center">
                <button
                  type="button"
                  onClick={handleAdd}
                  className={cn(
                    "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-2",
                    "text-[var(--ds-ai,var(--vauto-primary))] transition-transform duration-150 active:scale-95",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand,var(--vauto-primary))]"
                  )}
                  aria-label="Įdėti naują skelbimą"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ds-ai-soft,color-mix(in_srgb,var(--vauto-primary)_16%,transparent))] text-[var(--ds-ai,var(--vauto-primary))] shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-[10px] font-semibold">{tab.label}</span>
                </button>
              </li>
            );
          }

          return (
            <li key={tab.id} className="flex flex-1 justify-center">
              <Link
                href={tab.href!}
                onClick={(e) => {
                  if (tab.href === "/") {
                    handleHome(e);
                    return;
                  }
                  if (
                    !isAuthenticated &&
                    (tab.id === "chats" || tab.id === "profile")
                  ) {
                    e.preventDefault();
                    openAuthModal(tab.href!);
                  }
                }}
                className={cn(
                  "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 px-1 py-1",
                  "text-[10px] font-semibold transition-colors duration-[160ms]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand,var(--vauto-primary))]",
                  active
                    ? "text-[var(--ds-brand,var(--vauto-primary))]"
                    : "text-[var(--ds-text-muted,var(--vauto-text-muted))] hover:text-[var(--ds-text-primary,var(--vauto-text-main))]"
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden />
                  {tab.id === "chats" && isAuthenticated && unreadChats > 0 ? (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                      {unreadChats > 9 ? "9+" : unreadChats}
                    </span>
                  ) : null}
                </span>
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
