"use client";

import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SyncErrorBanner } from "@/components/SyncErrorBanner";
import { useShellChrome } from "@/hooks/useShellChrome";
import { cn } from "@/lib/cn";

interface AppShellProps {
  children: ReactNode;
  hideNav?: boolean;
  /** Light inner pages (chats, profile) vs home split layout */
  variant?: "home" | "plain";
}

export function AppShell({
  children,
  hideNav = false,
  variant = "home",
}: AppShellProps) {
  const shell = useShellChrome();
  const navHidden = hideNav || shell.hideBottomNav;

  if (variant === "plain") {
    return (
      <div className="vauto-light-page flex min-h-dvh flex-col bg-[var(--vauto-bg)] text-[var(--vauto-text-main)]">
        <div
          className={cn(
            "mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-4",
            shell.contentBottomClass
          )}
        >
          <SyncErrorBanner />
          {children}
          {!shell.hideSiteFooter && <SiteFooter className="-mx-4 mt-6" />}
        </div>
        {!navHidden && <BottomNav />}
        {!navHidden && <InstallAppBanner />}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--vauto-bg)] text-[var(--vauto-text-main)] transition-colors duration-300">
      <div
        className={cn(
          "mx-auto flex w-full max-w-lg flex-1 flex-col",
          shell.contentBottomClass
        )}
      >
        <div className="px-4 pt-2">
          <SyncErrorBanner />
        </div>
        {children}
        {!shell.hideSiteFooter && <SiteFooter />}
      </div>
      {!navHidden && <BottomNav />}
      {!navHidden && <InstallAppBanner />}
    </div>
  );
}
