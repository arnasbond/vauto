"use client";

import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { SyncErrorBanner } from "@/components/SyncErrorBanner";

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
  if (variant === "plain") {
    return (
      <div className="vauto-light-page flex min-h-dvh flex-col bg-white text-slate-900">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-4 pb-28">
          <SyncErrorBanner />
          {children}
        </div>
        {!hideNav && <BottomNav />}
        {!hideNav && <InstallAppBanner />}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--portal-bg,#f3f5f8)] text-[var(--portal-text,#1f2937)] transition-colors duration-300">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col pb-24">
        <div className="px-4 pt-2">
          <SyncErrorBanner />
        </div>
        {children}
      </div>
      {!hideNav && <BottomNav />}
      {!hideNav && <InstallAppBanner />}
    </div>
  );
}
