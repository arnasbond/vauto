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

  const linkClass = (path: string) =>
    `flex flex-1 flex-col items-center gap-1 text-xs transition-colors ${
      pathname === path || (path !== "/" && pathname.startsWith(path))
        ? "font-bold text-[var(--vauto-teal)]"
        : "text-white/60 hover:text-white"
    }`;

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-[#0f172a]/80 py-3 pb-5 backdrop-blur-lg">
      <div className="relative mx-auto flex max-w-lg items-end justify-around px-2">
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
          className="relative -mt-4 flex flex-col items-center gap-1 text-xs font-bold text-[var(--vauto-orange)] hover:opacity-80"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--vauto-orange)] text-white shadow-lg shadow-[var(--vauto-orange)]/30">
            <Plus size={24} />
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
