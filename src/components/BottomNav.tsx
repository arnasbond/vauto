"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, Home, MessageCircle, Plus, Shield, User } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { countUnreadChats } from "@/lib/chat-helpers";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { chats, isAdmin, unreadAdminCount, user, requireAuthForListing } = useVauto();
  const unreadChats = countUnreadChats(chats, user.id);
  const chatBadge = unreadChats > 0 ? unreadChats : undefined;
  const adminBadge = isAdmin && unreadAdminCount > 0 ? unreadAdminCount : undefined;

  const profileLabel = isAdmin ? "VAUTO CC" : "Mano Vauto";
  const ProfileIcon = isAdmin ? Shield : User;

  const tabs = [
    { href: "/", label: "Pradžia", icon: Home },
    { href: "/discover", label: "Atrasti", icon: Compass },
    { href: "/chats", label: "Pokalbiai", icon: MessageCircle, badge: chatBadge },
    {
      href: "/profile",
      label: profileLabel,
      icon: ProfileIcon,
      badge: adminBadge,
    },
  ];

  const handleAddClick = () => {
    if (requireAuthForListing("/add")) {
      router.push("/add");
    }
  };

  const linkClass = (path: string) => {
    const isActive =
      pathname === path || (path !== "/" && pathname.startsWith(path));
    return `flex min-w-0 flex-1 flex-col items-center gap-1 text-[10px] font-semibold transition-colors ${
      isActive ? "text-[#1167b1]" : "text-[#6b7280] hover:text-[#1167b1]"
    }`;
  };

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-[#d7dde5] bg-white/95 py-2 pb-6 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-lg items-end justify-around px-2">
        {tabs.slice(0, 2).map((tab) => {
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} className={linkClass(tab.href)}>
              <Icon size={21} />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={handleAddClick}
          className="relative -mt-8 flex min-w-[72px] flex-col items-center gap-1 text-[10px] font-bold text-[#f97316]"
          aria-label="Įdėti skelbimą"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-[5px] border-white bg-[#f97316] text-white shadow-[0_10px_28px_rgba(249,115,22,0.35)]">
            <Plus size={26} strokeWidth={2} />
          </span>
          <span>Įdėti</span>
        </button>

        {tabs.slice(2).map((tab) => {
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} className={`relative ${linkClass(tab.href)}`}>
              <div className="relative">
                <Icon size={20} />
                {tab.badge !== undefined && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
