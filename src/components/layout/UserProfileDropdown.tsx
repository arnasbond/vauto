"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  ChevronDown,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Handshake,
  Settings,
  Shield,
  User,
} from "lucide-react";
import { GuestAvatar } from "@/components/auth/GuestAvatar";
import { useVauto } from "@/context/VautoContext";
import { useChat } from "@/context/ChatContext";
import { countUnreadChats } from "@/lib/chat-helpers";
import { cn } from "@/lib/cn";
import { isSuperAdminUser } from "@/lib/admin-access";

/** Sticky header clearance used in max-height formula. */
const HEADER_CLEARANCE_PX = 56;
const MENU_GAP_PX = 8;
const VIEWPORT_EDGE_PX = 12;
/** Keep the panel short enough that overflow always scrolls on phones. */
const MOBILE_MAX_PANEL_RATIO = 0.72;

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
          <span className="block truncate text-xs text-[var(--vauto-text-muted,var(--anonser-text-muted))]">
            {hint}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function visibleViewportHeight(): number {
  if (typeof window === "undefined") return 640;
  const vv = window.visualViewport;
  if (vv && Number.isFinite(vv.height) && vv.height > 0) {
    return vv.height;
  }
  return window.innerHeight;
}

export function UserProfileDropdown({ variant = "desktop" }: UserProfileDropdownProps) {
  const { user, isAuthenticated, openAuthModal, logout } = useVauto();
  const { chats } = useChat();
  const unread = countUnreadChats(chats, user?.id ?? "");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const showControlCenter = isAuthenticated && isSuperAdminUser(user);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;

    const rect = trigger.getBoundingClientRect();
    const right = Math.max(VIEWPORT_EDGE_PX, window.innerWidth - rect.right);
    const top = rect.bottom + MENU_GAP_PX;
    const vh = visibleViewportHeight();
    const remainingBelow = Math.max(140, vh - top - VIEWPORT_EDGE_PX);
    const capped = Math.min(
      remainingBelow,
      Math.floor(vh * MOBILE_MAX_PANEL_RATIO),
      vh - HEADER_CLEARANCE_PX - 20
    );
    // Pixel max-height is reliable on Android/iOS; CSS dvh is a fallback floor.
    const maxHeightPx = Math.max(180, capped);

    setMenuStyle({
      position: "fixed",
      top,
      right,
      zIndex: 280,
      maxHeight: `${maxHeightPx}px`,
      // Inline overflow so nothing can drop the scroller (Tailwind alone was flaky).
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch",
      overscrollBehavior: "contain",
      touchAction: "pan-y",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition, showControlCenter, unread]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    // Do NOT listen to scroll in capture mode — scrolling the menu itself would
    // re-render position and cancel the gesture on mobile.
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("resize", onReposition);
      vv?.removeEventListener("resize", onReposition);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
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

  const menu =
    open && isAuthenticated && mounted ? (
      <div
        ref={menuRef}
        role="menu"
        style={menuStyle}
        className={cn(
          "vauto-profile-menu min-w-[15.5rem] rounded-2xl border py-2 shadow-xl",
          "border-[var(--vauto-border,var(--anonser-border))]",
          "bg-[color-mix(in_srgb,var(--vauto-card-bg,var(--anonser-card))_88%,transparent)] backdrop-blur-md",
          // CSS fallback when inline style is not yet applied on first paint.
          "max-h-[calc(100dvh-3.5rem-20px-env(safe-area-inset-bottom,0px))] overflow-y-auto overscroll-contain",
          "[-webkit-overflow-scrolling:touch] [touch-action:pan-y]"
        )}
        onWheel={(e) => {
          // Keep wheel / trackpad scrolls inside the menu (don't scroll the page).
          e.stopPropagation();
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="sticky top-0 z-[1] border-b border-[var(--vauto-border,var(--anonser-border))] bg-[color-mix(in_srgb,var(--vauto-card-bg,var(--anonser-card))_92%,transparent)] px-4 pb-3 pt-1 backdrop-blur-md">
          <p className="truncate text-sm font-semibold text-[var(--vauto-text-main,var(--anonser-text))]">
            {user.name}
          </p>
          <p className="truncate text-xs text-[var(--vauto-text-muted,var(--anonser-text-muted))]">
            {user.email || user.phone || "Asmeninis kabinetas"}
          </p>
        </div>

        <div className="py-1">
          {showControlCenter ? (
            <MenuLink
              href="/profile/?tab=ops"
              icon={<Shield className="h-4 w-4" />}
              label="VAUTO Control Center"
              hint="Administratoriaus skydelis"
              onNavigate={close}
            />
          ) : null}
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
            href="/sandoriai/"
            icon={<Handshake className="h-4 w-4" />}
            label="Sandoriai"
            hint="Mokėjimas, Omniva, ginčai ir atsiliepimai"
            onNavigate={close}
          />
          <MenuLink
            href="/verslui/"
            icon={<BarChart3 className="h-4 w-4" />}
            label="Mano verslas / Analitika"
            hint="Verslo portalas, bulk įkėlimas ir analitika"
            onNavigate={close}
          />
        </div>

        <div className="border-t border-[var(--vauto-border,var(--anonser-border))] py-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
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
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
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
              className={cn(
                "h-4 w-4 text-[var(--anonser-text-muted)] transition",
                open && "rotate-180"
              )}
              aria-hidden
            />
          </>
        )}
      </button>

      {menu && createPortal(menu, document.body)}
    </div>
  );
}
