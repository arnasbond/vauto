"use client";

import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SyncErrorBanner } from "@/components/SyncErrorBanner";
import { DesktopHeader } from "@/components/layout/desktop/DesktopHeader";
import { DesktopFooter } from "@/components/layout/desktop/DesktopFooter";
import { useShellChrome } from "@/hooks/useShellChrome";
import { cn } from "@/lib/cn";

interface VautoAdaptiveLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
  /** Light inner pages (chats, profile) vs home split layout */
  variant?: "home" | "plain";
}

/**
 * Adaptive shell: mobile AppShell chrome below md, desktop Anonser portal above md.
 * Children mount once — shared SSE/search/agent data streams.
 */
export function VautoAdaptiveLayout({
  children,
  hideNav = false,
  variant = "home",
}: VautoAdaptiveLayoutProps) {
  const shell = useShellChrome();
  const navHidden = hideNav || shell.hideBottomNav;
  const isPlain = variant === "plain";

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col transition-colors duration-300",
        "bg-[var(--vauto-bg)] text-[var(--vauto-text-main)]",
        "md:bg-[var(--anonser-bg)] md:text-[var(--anonser-text)]"
      )}
    >
      {/* Desktop header */}
      <div className="hidden md:block">
        <DesktopHeader />
      </div>

      {/* Shared content — single mount */}
      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col",
          "max-w-lg md:max-w-[var(--anonser-desktop-max)]",
          isPlain ? "px-4 pt-4 md:px-6 md:py-6" : "md:px-6 md:py-6",
          shell.contentBottomClass
        )}
      >
        <div className={cn(!isPlain && "px-4 pt-2 md:px-0 md:pt-0")}>
          <SyncErrorBanner />
        </div>
        {children}
        {!shell.hideSiteFooter && (
          <div className="md:hidden">
            <SiteFooter className={isPlain ? "-mx-4 mt-6" : undefined} />
          </div>
        )}
      </div>

      {/* Desktop footer */}
      <div className="hidden md:block">
        <DesktopFooter />
      </div>

      {/* Mobile bottom nav */}
      {!navHidden && (
        <div className="md:hidden">
          <BottomNav />
          <InstallAppBanner />
        </div>
      )}
    </div>
  );
}
