"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, MessageCircle, Plus, Shirt, Shield, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { countUnreadChats } from "@/lib/chat-helpers";
import { cn } from "@/lib/cn";

const TAB_CLASS =
  "flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[10px] font-semibold no-underline";

/**
 * Fashion-first bottom bar — Pradžia, Spinta, Įdėk (+), Pokalbiai, Profilis.
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isAdmin,
    isAuthenticated,
    unreadAdminCount,
    unreadUserReportCount,
    sellerStep,
    chats,
    user,
    openAuthModal,
    requireAuthForListing,
  } = useVauto();

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
  const spintaActive =
    pathname === "/fashion" ||
    pathname.startsWith("/fashion/");
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
    const addPath = spintaActive ? "/add/?vertical=fashion" : "/add/";
    if (!requireAuthForListing(addPath)) return;
    router.push(addPath);
  };

  const handleMessages = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      openAuthModal("/chats/");
    }
  };

  const handleSpinta = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      openAuthModal("/fashion/");
    }
  };

  const tabColor = (active: boolean) =>
    active ? "var(--vauto-primary)" : "var(--vauto-text-muted)";

  return (
    <nav
      className="vauto-bottom-nav safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t py-1.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
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
          href="/fashion/"
          onClick={handleSpinta}
          className={cn(TAB_CLASS)}
          style={{ color: tabColor(spintaActive) }}
          aria-current={spintaActive ? "page" : undefined}
        >
          <Shirt size={22} strokeWidth={spintaActive ? 2.5 : 2} />
          <span>Spinta</span>
        </Link>

        <button
          type="button"
          onClick={handlePlaceAd}
          disabled={placeAdBusy}
          className="relative -mt-7 flex min-w-[72px] shrink-0 flex-col items-center gap-0.5 text-[10px] font-bold disabled:opacity-50"
          style={{ color: "var(--vauto-accent)" }}
          aria-label="Įdėti naują skelbimą"
        >
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full border-[4px] border-[var(--vauto-card-bg)] text-[var(--vauto-primary-contrast,#fff)] shadow-lg"
            style={{
              backgroundColor: "var(--vauto-accent)",
              boxShadow: "0 10px 28px color-mix(in srgb, var(--vauto-accent) 35%, transparent)",
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
