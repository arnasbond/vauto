"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Home, LayoutGrid, MessageCircle, Plus, Shield, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearchDispatch } from "@/context/VautoSearchContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useChat } from "@/context/ChatContext";
import { useModeration } from "@/context/ModerationContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { useZeroUiMemory } from "@/context/ZeroUiMemoryContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { dispatchHomeReset } from "@/lib/home-reset";
import { clearPhotoSearchSession } from "@/lib/photo-search-session";
import { countUnreadChats } from "@/lib/chat-helpers";
import { cn } from "@/lib/cn";
import {
  cabinetNavLabel,
  defaultCabinetPath,
} from "@/lib/profile-type";

const TAB_CLASS =
  "flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[10px] font-semibold no-underline";

/**
 * Bottom bar — Pradžia, Asortimentas, Įdėk (+), Pokalbiai, Profilis.
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isAdmin,
    isAuthenticated,
    user,
    openAuthModal,
    requireAuthForListing,
    clearVisualSearch,
  } = useVauto();
  const { unreadAdminCount, unreadUserReportCount } = useModeration();
  const { sellerStep, cancelSellerFlow } = useSellerFlow();
  const { chats } = useChat();
  const {
    setSearchQuery,
    setSearchLoading,
    clearAgentPinnedListings,
    resetMarketplaceFilters,
    setSearchInputMode,
    setSearchVoiceMode,
  } = useVautoSearchDispatch();
  const { goToMarketplace } = useZeroUiScreen();
  const { clearSearchFilters } = useZeroUiMemory();
  const { setOpen: setAgentOpen } = useVautoAgent();

  const resetSellerIfLeavingFlow = useCallback(() => {
    if (sellerStep !== "idle" && sellerStep !== "published") {
      cancelSellerFlow();
    }
  }, [sellerStep, cancelSellerFlow]);

  const resetHomeExperience = useCallback(() => {
    resetSellerIfLeavingFlow();
    setSearchQuery("");
    setSearchLoading(false);
    clearAgentPinnedListings();
    resetMarketplaceFilters();
    clearVisualSearch();
    setSearchInputMode(null);
    setSearchVoiceMode(false);
    clearSearchFilters();
    clearPhotoSearchSession();
    goToMarketplace("user");
    setAgentOpen(false);
    dispatchHomeReset();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [
    resetSellerIfLeavingFlow,
    setSearchQuery,
    setSearchLoading,
    clearAgentPinnedListings,
    resetMarketplaceFilters,
    clearVisualSearch,
    setSearchInputMode,
    setSearchVoiceMode,
    clearSearchFilters,
    goToMarketplace,
    setAgentOpen,
  ]);

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
    pathname === "/mano-skelbimai" ||
    pathname.startsWith("/mano-skelbimai/") ||
    pathname === "/fashion" ||
    pathname.startsWith("/fashion/") ||
    pathname === "/auth-gate" ||
    pathname.startsWith("/auth-gate/");
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
    const addPath = "/add/";
    if (!requireAuthForListing(addPath)) return;
    router.push(addPath);
  };

  const handleMessages = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      openAuthModal("/chats/");
    }
  };

  const spintaHref = isAuthenticated
    ? defaultCabinetPath(user.profileType)
    : "/auth-gate/";
  const spintaLabel = isAuthenticated
    ? cabinetNavLabel(user.profileType)
    : "Asortimentas";

  const handleSpinta = (e: React.MouseEvent) => {
    resetSellerIfLeavingFlow();
    if (!isAuthenticated) {
      e.preventDefault();
      router.push("/auth-gate/");
      return;
    }
    e.preventDefault();
    setSearchQuery("");
    setSearchLoading(false);
    clearAgentPinnedListings();
    resetMarketplaceFilters();
    clearVisualSearch();
    setSearchInputMode(null);
    setSearchVoiceMode(false);
    dispatchHomeReset();
    router.push("/mano-skelbimai/");
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
          onClick={resetHomeExperience}
          className={cn(TAB_CLASS)}
          style={{ color: tabColor(homeActive) }}
          aria-current={homeActive ? "page" : undefined}
        >
          <Home size={22} strokeWidth={homeActive ? 2.5 : 2} />
          <span>Pradžia</span>
        </Link>

        <Link
          href={spintaHref}
          onClick={handleSpinta}
          className={cn(TAB_CLASS)}
          style={{ color: tabColor(spintaActive) }}
          aria-current={spintaActive ? "page" : undefined}
        >
          <LayoutGrid size={22} strokeWidth={spintaActive ? 2.5 : 2} />
          <span>{spintaLabel}</span>
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
          onClick={(e) => {
            resetSellerIfLeavingFlow();
            handleMessages(e);
          }}
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
            resetSellerIfLeavingFlow();
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
