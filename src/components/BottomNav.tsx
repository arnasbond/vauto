"use client";

import { Plus, Shield, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useActivePortal } from "@/hooks/useActivePortal";

/**
 * Marktplaats-style bottom bar — centre Place ad (+) + profile.
 */
export function BottomNav() {
  const pathname = usePathname();
  const {
    isAdmin,
    unreadAdminCount,
    unreadUserReportCount,
    startUploadFlow,
    sellerStep,
  } = useVauto();
  const { ui } = useActivePortal();

  const profileHref = "/profile/";
  const profileLabel = isAdmin ? "VAUTO CC" : "Profilis";
  const ProfileIcon = isAdmin ? Shield : User;
  const profileBadge = isAdmin
    ? unreadAdminCount > 0
      ? unreadAdminCount
      : undefined
    : unreadUserReportCount > 0
      ? unreadUserReportCount
      : undefined;

  const profileActive =
    pathname === "/profile" || pathname.startsWith("/profile/");

  const placeAdBusy =
    sellerStep !== "idle" && sellerStep !== "published";

  const handlePlaceAd = () => {
    if (placeAdBusy) return;
    void startUploadFlow();
  };

  return (
    <nav
      className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-[#d7dde5] bg-white/95 py-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl"
      translate="no"
      aria-label="Pagrindinė navigacija"
    >
      <div className="relative mx-auto flex max-w-lg items-end justify-between px-10">
        <div className="w-16" aria-hidden />

        <button
          type="button"
          onClick={handlePlaceAd}
          disabled={placeAdBusy}
          className="relative -mt-8 flex min-w-[72px] flex-col items-center gap-1 text-[10px] font-bold disabled:opacity-50"
          style={{ color: ui.cta }}
          aria-label="Įdėti naują skelbimą"
        >
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full border-[5px] border-white text-white shadow-lg"
            style={{
              backgroundColor: ui.cta,
              boxShadow: `0 10px 28px ${ui.cta}59`,
            }}
          >
            <Plus className="h-8 w-8" strokeWidth={2.5} />
          </span>
          <span>Įdėk</span>
        </button>

        <a
          href={profileHref}
          className="flex w-16 flex-col items-center gap-1 text-[10px] font-semibold no-underline"
          style={{ color: profileActive ? ui.accent : ui.textMuted }}
        >
          <div className="relative">
            <ProfileIcon size={22} />
            {profileBadge !== undefined && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                {profileBadge}
              </span>
            )}
          </div>
          <span className="truncate">{profileLabel}</span>
        </a>
      </div>
    </nav>
  );
}
