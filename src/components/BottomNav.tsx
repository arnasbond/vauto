"use client";

import { usePathname } from "next/navigation";
import { Compass, Home, MessageCircle, Plus, Shield, User } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { useActivePortal } from "@/hooks/useActivePortal";
import { countUnreadChats } from "@/lib/chat-helpers";

/**
 * Bottom tab bar for static-export PWA.
 * Uses plain <a> + trailing slashes so mobile browsers never land on RSC index.txt.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { chats, isAdmin, unreadAdminCount, unreadUserReportCount, user, requireAuthForListing } = useVauto();
  const { ui } = useActivePortal();
  const unreadChats = countUnreadChats(chats, user.id);
  const chatBadge = unreadChats > 0 ? unreadChats : undefined;
  const profileBadge = isAdmin
    ? unreadAdminCount > 0
      ? unreadAdminCount
      : undefined
    : unreadUserReportCount > 0
      ? unreadUserReportCount
      : undefined;

  const profileLabel = isAdmin ? "VAUTO CC" : "Mano Vauto";
  const ProfileIcon = isAdmin ? Shield : User;

  const tabs = [
    { href: "/", label: "Pradžia", icon: Home },
    { href: "/discover/", label: "Atrasti", icon: Compass },
    { href: "/chats/", label: "Pokalbiai", icon: MessageCircle, badge: chatBadge },
    {
      href: "/profile/",
      label: profileLabel,
      icon: ProfileIcon,
      badge: profileBadge,
    },
  ];

  const handleAddClick = () => {
    if (requireAuthForListing("/add/")) {
      window.location.assign("/add/");
    }
  };

  const linkClass = () =>
    "flex min-w-0 flex-1 flex-col items-center gap-1 text-[10px] font-semibold transition-colors no-underline";

  const linkStyle = (path: string) => {
    const normalized = path === "/" ? "/" : path.replace(/\/$/, "");
    const isActive =
      pathname === path ||
      pathname === normalized ||
      (normalized !== "/" && pathname.startsWith(normalized));
    return { color: isActive ? ui.accent : ui.textMuted };
  };

  return (
    <nav
      className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-[#d7dde5] bg-white/95 py-2 pb-6 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl"
      translate="no"
    >
      <div className="relative mx-auto flex max-w-lg items-end justify-around px-2">
        {tabs.slice(0, 2).map((tab) => {
          const Icon = tab.icon;
          return (
            <a key={tab.href} href={tab.href} className={linkClass()} style={linkStyle(tab.href)}>
              <Icon size={21} />
              <span className="truncate">{tab.label}</span>
            </a>
          );
        })}

        <button
          type="button"
          onClick={handleAddClick}
          className="relative -mt-8 flex min-w-[72px] flex-col items-center gap-1 text-[10px] font-bold"
          style={{ color: ui.cta }}
          aria-label="Įdėti skelbimą"
        >
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full border-[5px] border-white text-white shadow-lg"
            style={{ backgroundColor: ui.cta, boxShadow: `0 10px 28px ${ui.cta}59` }}
          >
            <Plus size={26} strokeWidth={2} />
          </span>
          <span>Įdėti</span>
        </button>

        {tabs.slice(2).map((tab) => {
          const Icon = tab.icon;
          return (
            <a
              key={tab.href}
              href={tab.href}
              className={`relative ${linkClass()}`}
              style={linkStyle(tab.href)}
            >
              <div className="relative">
                <Icon size={20} />
                {tab.badge !== undefined && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="truncate">{tab.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
