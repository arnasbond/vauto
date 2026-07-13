"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  ChevronDown,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Settings,
  User,
} from "lucide-react";
import { GuestAvatar } from "@/components/auth/GuestAvatar";
import { useVauto } from "@/context/VautoContext";
import { useChat } from "@/context/ChatContext";
import { countUnreadChats } from "@/lib/chat-helpers";
import { cn } from "@/lib/cn";

interface UserProfileDropdownProps {
  variant?: "desktop" | "mobile";
}

interface MenuLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  badge?: number;
  onNavigate?: () => void;
}

function MenuLink({ href, icon, label, hint, badge, onNavigate }: MenuLinkProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-[color-mix(in_srgb,var(--vauto-primary,var(--anonser-primary))_6%,transparent)] rounded-lg mx-1"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--vauto-primary,var(--anonser-primary))_12%,transparent)] text-[var(--vauto-primary,var(--anonser-primary))]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-[var(--vauto-text-main,var(--anonser-text))]">
          {label}
          {badge != null && badge > 0 && (
            <span className="rounded-full bg-[var(--anonser-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        {hint ? (
          <span className="block truncate text-xs text-[var(--vauto-text-muted,var(--anonser-text-muted))]">{hint}</span>
        ) : null}
      </span>
    </Link>
  );
}

export function UserProfileDropdown({ variant = "desktop" }: UserProfileDropdownProps) {
  const { user, isAuthenticated, openAuthModal, logout } = useVauto();
  const { chats } = useChat();
  const unread = countUnreadChats(chats, user?.id ?? "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const handleToggle = () => {
    if (!isAuthenticated) {
      openAuthModal("/profile/");
      return;
    }
    setOpen((prev) => !prev);
  };

  const triggerLabel = isAuthenticated
    ? user.firstName || user.name?.split(/\s+/)[0] || "Profilis"
    : "Prisijungti";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-2 rounded-xl transition",
          variant === "desktop"
            ? "px-2.5 py-2 text-sm font-medium text-[var(--anonser-text)] hover:bg-[var(--anonser-surface-muted)]"
            : "p-0.5"
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={isAuthenticated ? "Profilio meniu" : "Prisijungti"}
      >
        {isAuthenticated && user.avatar ? (
          <span className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-[var(--anonser-border)]">
            <Image
              src={user.avatar}
              alt={user.name}
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          </span>
        ) : (
          <GuestAvatar size="sm" showLabel={false} />
        )}
        {variant === "desktop" && (
          <>
            <span className="max-w-[7rem] truncate">{triggerLabel}</span>
            <ChevronDown
              className={cn("h-4 w-4 text-[var(--anonser-text-muted)] transition", open && "rotate-180")}
              aria-hidden
            />
          </>
        )}
      </button>

      {open && isAuthenticated && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 mt-2 min-w-[15.5rem] overflow-hidden rounded-2xl border py-2 shadow-xl",
            "border-[var(--vauto-border,var(--anonser-border))] bg-[var(--vauto-card-bg,var(--anonser-card))]",
            variant === "desktop" ? "right-0" : "right-0"
          )}
        >
          <div className="border-b border-[var(--vauto-border,var(--anonser-border))] px-4 pb-3 pt-1">
            <p className="truncate text-sm font-semibold text-[var(--vauto-text-main,var(--anonser-text))]">{user.name}</p>
            <p className="truncate text-xs text-[var(--vauto-text-muted,var(--anonser-text-muted))]">
              {user.email || user.phone || "Asmeninis kabinetas"}
            </p>
          </div>

          <div className="py-1">
            <MenuLink
              href="/mano-skelbimai/"
              icon={<LayoutGrid className="h-4 w-4" />}
              label="Mano skelbimai"
              hint="Valdykite ir redaguokite skelbimus"
              onNavigate={close}
            />
            <MenuLink
              href="/chats/"
              icon={<MessageCircle className="h-4 w-4" />}
              label="Pokalbiai"
              hint="Susirašinėjimai su pirkėjais"
              badge={unread}
              onNavigate={close}
            />
            <MenuLink
              href="/verslui/"
              icon={<BarChart3 className="h-4 w-4" />}
              label="Mano verslas / Analitika"
              hint="Verslo kabinetas ir statistika"
              onNavigate={close}
            />
          </div>

          <div className="border-t border-[var(--vauto-border,var(--anonser-border))] py-1">
            <MenuLink
              href="/profile/"
              icon={<User className="h-4 w-4" />}
              label="Profilis"
              onNavigate={close}
            />
            <MenuLink
              href="/profile/settings/"
              icon={<Settings className="h-4 w-4" />}
              label="Nustatymai"
              onNavigate={close}
            />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                logout();
              }}
              className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
                <LogOut className="h-4 w-4" />
              </span>
              Atsijungti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
