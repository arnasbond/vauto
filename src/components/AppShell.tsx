"use client";

import type { ReactNode } from "react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";

interface AppShellProps {
  children: ReactNode;
  hideNav?: boolean;
  /** Light inner pages (chats, profile) vs home split layout */
  variant?: "home" | "plain";
}

/**
 * Legacy AppShell entry — delegates to App Shell 2.0 adaptive chrome.
 * Keeps the same public props so page imports stay stable.
 */
export function AppShell({
  children,
  hideNav = false,
  variant = "home",
}: AppShellProps) {
  return (
    <VautoAdaptiveLayout hideNav={hideNav} variant={variant}>
      {children}
    </VautoAdaptiveLayout>
  );
}
