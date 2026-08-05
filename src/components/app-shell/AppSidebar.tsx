"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { IconButton } from "@/design-system";
import { cn } from "@/lib/cn";
import {
  BUSINESS_PORTAL_NAV,
  CONTROL_CENTER_NAV,
  SIDEBAR_COLLAPSE_KEY,
  isNavItemActive,
  type AppShellZone,
  type NavItem,
} from "./nav-config";

type AppSidebarProps = {
  zone: "business" | "control-center";
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppSidebar({
  zone,
  mobileOpen = false,
  onMobileClose,
}: AppSidebarProps) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMobileClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  const items: NavItem[] = useMemo(
    () => (zone === "control-center" ? CONTROL_CENTER_NAV : BUSINESS_PORTAL_NAV),
    [zone]
  );

  const title = zone === "control-center" ? "Control Center" : "Verslo portalas";

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const nav = (
    <nav aria-label={title} className="flex flex-1 flex-col gap-1 p-2">
      {items.map((item) => {
        const active = isNavItemActive(item, pathname, search);
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            title={item.label}
            onClick={onMobileClose}
            className={cn(
              "group flex items-center gap-3 rounded-[var(--ds-radius-control)] px-3 py-2.5 text-[length:var(--ds-text-body-sm-size)] font-semibold transition-colors duration-[var(--ds-duration-normal)]",
              "min-h-11 focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
              active
                ? "bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]"
                : "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-muted)] hover:text-[var(--ds-text-primary)]",
              collapsed && "justify-center px-2"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );

  const desktopAside = (
    <aside
      data-app-sidebar
      className={cn(
        "sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col border-r border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)]/90 backdrop-blur-md md:flex",
        "transition-[width] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease)]",
        collapsed ? "w-[4.5rem]" : "w-60"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--ds-border-subtle)] px-3 py-3">
        {!collapsed ? (
          <p className="ds-label truncate text-[var(--ds-text-muted)]">{title}</p>
        ) : (
          <span className="sr-only">{title}</span>
        )}
        <IconButton
          label={collapsed ? "Išskleisti meniu" : "Suskleisti meniu"}
          tone="muted"
          size="sm"
          onClick={toggleCollapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </IconButton>
      </div>
      {nav}
    </aside>
  );

  const mobileDrawer = mobileOpen ? (
    <div className="fixed inset-0 z-[60] md:hidden" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Uždaryti meniu"
        onClick={onMobileClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-[var(--ds-surface-elevated)] shadow-[var(--ds-shadow-lg)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--ds-border-subtle)] px-3 py-3">
          <p className="ds-label">{title}</p>
          <IconButton label="Uždaryti" tone="muted" size="sm" onClick={onMobileClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="overflow-y-auto">{nav}</div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      {desktopAside}
      {mobileDrawer}
    </>
  );
}

export type { AppShellZone };
