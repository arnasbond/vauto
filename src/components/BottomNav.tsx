"use client";

import Link from "next/link";
import { Home, MessageCircle, Plus, Search, Shield, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useActivePortal } from "@/hooks/useActivePortal";
import { countUnreadChats } from "@/lib/chat-helpers";
import { cn } from "@/lib/cn";

const TAB_CLASS =
  "flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[10px] font-semibold no-underline";

/**
 * Marktplaats-style 5-tab bottom bar — Pradžia, Paieška, Įdėk (+), Pokalbiai, Profilis.
 */
export function BottomNav() {
  const pathname = usePathname();
  const {
    isAdmin,
    isAuthenticated,
    unreadAdminCount,
    unreadUserReportCount,
    startUploadFlow,
    sellerStep,
    chats,
    user,
    openAuthModal,
    requireAuthForListing,
  } = useVauto();
  const { ui } = useActivePortal();

  const profileHref = "/profile/";
  const profileLabel = isAdmin ? "VAUTO CC" : "Profilis";
  const ProfileIcon = isAdmin ? Shield : User;
  const profileBadge =
    isAuthenticated &&
    (isAdmin
      ? unreadAdminCount > 0
        ? unreadAdminCount
        : undefined
      : unreadUserReportCount > 0
        ? unreadUserReportCount
        : undefined);

  const unreadChats = isAuthenticated ? countUnreadChats(chats, user.id) : 0;

  const homeActive = pathname === "/" || pathname === "";
  const searchActive =
    pathname === "/search" ||
    pathname.startsWith("/search/") ||
    pathname === "/discover" ||
    pathname.startsWith("/discover/");
  const messagesActive =
    pathname === "/messages" ||
    pathname.startsWith("/messages/") ||
    pathname === "/chats" ||
    pathname.startsWith("/chats/") ||
    pathname === "/pokalbiai" ||
    pathname.startsWith("/pokalbiai/");
  const profileActive =
    pathname === "/profile" || pathname.startsWith("/profile/");

  const placeAdBusy =
    sellerStep !== "idle" && sellerStep !== "published";

  const handlePlaceAd = () => {
    if (placeAdBusy) return;
    if (!requireAuthForListing("/add/")) return;
    void startUploadFlow();
  };

  const handleMessages = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      openAuthModal("/chats/");
    }
  };

  const tabColor = (active: boolean) =>
    active ? ui.accent : ui.textMuted;

  return (
    <nav
      className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-[#d7dde5] bg-white/95 py-1.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl"
      translate="no"
      aria-label="Pagrindinė navigacija"
    >
      <div className="relative mx-auto flex max-w-lg items-end justify-between px-2">
        <Link
          href="/"
          className={cn(TAB_CLASS)}
          style={{ color: tabColor(homeActive) }}
          aria-current={homeActive ? "page" : undefined}
        >
          <Home size={22} strokeWidth={homeActive ? 2.5 : 2} />
          <span>Pradžia</span>
        </Link>

        <Link
          href="/search/"
          className={cn(TAB_CLASS)}
          style={{ color: tabColor(searchActive) }}
          aria-current={searchActive ? "page" : undefined}
        >
          <Search size={22} strokeWidth={searchActive ? 2.5 : 2} />
          <span>Paieška</span>
        </Link>

        <button
          type="button"
          onClick={handlePlaceAd}
          disabled={placeAdBusy}
          className="relative -mt-7 flex min-w-[72px] shrink-0 flex-col items-center gap-0.5 text-[10px] font-bold disabled:opacity-50"
          style={{ color: ui.cta }}
          aria-label="Įdėti naują skelbimą"
        >
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full border-[4px] border-white text-white shadow-lg"
            style={{
              backgroundColor: ui.cta,
              boxShadow: `0 10px 28px ${ui.cta}59`,
            }}
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <span>Įdėk</span>
        </button>

        <Link
          href="/messages/"
          onClick={handleMessages}
          className={cn(TAB_CLASS)}
          style={{ color: tabColor(messagesActive) }}
          aria-current={messagesActive ? "page" : undefined}
        >
          <div className="relative">
            <MessageCircle size={22} strokeWidth={messagesActive ? 2.5 : 2} />
            {isAuthenticated && unreadChats > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                {unreadChats > 9 ? "9+" : unreadChats}
              </span>
            )}
          </div>
          <span>Pokalbiai</span>
        </Link>

        <Link
          href={profileHref}
          onClick={(e) => {
            if (!isAuthenticated) {
              e.preventDefault();
              openAuthModal("/profile/");
            }
          }}
          className={cn(TAB_CLASS)}
          style={{ color: tabColor(profileActive) }}
          aria-current={profileActive ? "page" : undefined}
        >
          <div className="relative">
            <ProfileIcon size={22} strokeWidth={profileActive ? 2.5 : 2} />
            {profileBadge !== undefined && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                {profileBadge}
              </span>
            )}
          </div>
          <span className="truncate">{profileLabel}</span>
        </Link>
      </div>
    </nav>
  );
}
