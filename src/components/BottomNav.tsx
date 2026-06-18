"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, Plus, Search, Shield, User } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { countUnreadChats } from "@/lib/chat-helpers";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { chats, isAdmin, reports, user, requireAuthForListing } = useVauto();
  const unreadChats = countUnreadChats(chats, user.id);
  const chatBadge = unreadChats > 0 ? unreadChats : undefined;
  const adminBadge = isAdmin
    ? reports.filter((r) => r.status === "open" && r.urgency === "critical").length ||
      undefined
    : undefined;

  const profileLabel = isAdmin ? "VAUTO CC" : "Profilis";
  const ProfileIcon = isAdmin ? Shield : User;

  const sideTabs = [
    { href: "/", label: "Paieška", icon: Search },
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
    return `flex flex-1 flex-col items-center gap-1 text-[10px] font-semibold transition-colors ${
      isActive ? "text-[#f8fafc]" : "text-[#64748b] hover:text-white/80"
    }`;
  };

  return (
    <nav className="vauto-flux-nav safe-bottom fixed bottom-0 left-0 right-0 z-50 py-3 pb-7">
      <span className="vauto-flux-glow-bar" aria-hidden />
      <div className="relative mx-auto flex max-w-lg items-end justify-around px-5">
        {(() => {
          const tab = sideTabs[0];
          const Icon = tab.icon;
          return (
            <Link href={tab.href} className={linkClass("/")}>
              <Icon size={20} />
              <span>{tab.label}</span>
            </Link>
          );
        })()}

        <button
          type="button"
          onClick={handleAddClick}
          className="fab-glow relative -mt-[18px] flex flex-col items-center"
          aria-label="Įdėti skelbimą"
        >
          <span className="vauto-flux-fab flex h-14 w-14 items-center justify-center rounded-[20px] text-white">
            <Plus size={26} strokeWidth={2} />
          </span>
        </button>

        {sideTabs.slice(1).map((tab) => {
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} className={`relative ${linkClass(tab.href)}`}>
              <div className="relative">
                <Icon size={20} />
                {tab.badge !== undefined && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--vauto-red)] px-1 text-[9px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
