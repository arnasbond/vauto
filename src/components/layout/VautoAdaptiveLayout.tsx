"use client";

import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SyncErrorBanner } from "@/components/SyncErrorBanner";
import { DesktopHeader } from "@/components/layout/desktop/DesktopHeader";
import { DesktopFooter } from "@/components/layout/desktop/DesktopFooter";
import { useShellChrome } from "@/hooks/useShellChrome";
import { useLayoutMode } from "@/context/LayoutModeContext";
import { cn } from "@/lib/cn";

interface VautoAdaptiveLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
  /** Light inner pages (chats, profile) vs home split layout */
  variant?: "home" | "plain";
}

/**
 * Adaptive shell — renders EITHER the desktop Anonser portal chrome OR the
 * mobile chrome, never both. Single-mount keeps SSE/search/agent streams and
 * avoids duplicate/hidden DOM (which broke query selectors & added weight).
 */
export function VautoAdaptiveLayout({
  children,
  hideNav = false,
  variant = "home",
}: VautoAdaptiveLayoutProps) {
  const shell = useShellChrome();
  const { isDesktop } = useLayoutMode();
  const navHidden = hideNav || shell.hideBottomNav;
  const isPlain = variant === "plain";

  if (isDesktop) {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--anonser-bg)] text-[var(--anonser-text)]">
        <DesktopHeader />
        <div className="vauto-adaptive-content mx-auto flex w-full flex-1 flex-col px-6 py-6">
          <SyncErrorBanner />
          {children}
        </div>
        <DesktopFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--vauto-bg)] text-[var(--vauto-text-main)] transition-colors duration-300">
      <div
        className={cn(
          "mx-auto flex w-full max-w-lg flex-1 flex-col",
          isPlain && "px-4 pt-4",
          shell.contentBottomClass
        )}
      >
        <div className={cn(!isPlain && "px-4 pt-2")}>
          <SyncErrorBanner />
        </div>
        {children}
        {!shell.hideSiteFooter && (
          <SiteFooter className={isPlain ? "-mx-4 mt-6" : undefined} />
        )}
      </div>
      {!navHidden && <BottomNav />}
      {!navHidden && <InstallAppBanner />}
    </div>
  );
}
