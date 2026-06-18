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

  const profileLabel = isAdmin ? "VAUTO CC" : "Dashboard";
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

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      <div className="relative mx-auto flex max-w-lg items-end justify-around px-2 pb-2 pt-1">
        {(() => {
          const tab = sideTabs[0];
          const isActive = pathname === "/";
          const Icon = tab.icon;
          return (
            <Link
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-1 ${
                isActive
                  ? "text-[var(--vauto-blue)]"
                  : "text-[var(--vauto-text-muted)]"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.75} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })()}

        <button
          type="button"
          onClick={handleAddClick}
          className="fab-glow relative -mt-6 flex flex-col items-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--vauto-orange)]">
              <Plus className="h-6 w-6 text-white" strokeWidth={2.5} />
            </span>
          </span>
          <span className="mt-0.5 text-[10px] font-medium text-[var(--vauto-text-muted)]">
            Įdėti
          </span>
        </button>

        {sideTabs.slice(1).map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-1 ${
                isActive
                  ? "text-[var(--vauto-blue)]"
                  : "text-[var(--vauto-text-muted)]"
              }`}
            >
              <div className="relative">
                <Icon
                  className="h-5 w-5"
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
                {tab.badge !== undefined && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--vauto-red)] px-1 text-[9px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
