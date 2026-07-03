"use client";

import type { ReactNode } from "react";
import { DesktopHeader } from "@/components/layout/desktop/DesktopHeader";
import { DesktopFooter } from "@/components/layout/desktop/DesktopFooter";
import { SyncErrorBanner } from "@/components/SyncErrorBanner";

interface DesktopShellProps {
  children: ReactNode;
}

/** Desktop Anonser portal chrome — wide layout, no bottom tab bar. */
export function DesktopShell({ children }: DesktopShellProps) {
  return (
    <div className="anonser-desktop flex min-h-dvh flex-col bg-[var(--anonser-bg)] text-[var(--anonser-text)]">
      <DesktopHeader />
      <main className="mx-auto w-full max-w-[var(--anonser-desktop-max)] flex-1 px-6 py-6">
        <SyncErrorBanner />
        {children}
      </main>
      <DesktopFooter />
    </div>
  );
}
