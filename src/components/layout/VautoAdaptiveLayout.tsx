"use client";

import { Suspense, useCallback, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SyncErrorBanner } from "@/components/SyncErrorBanner";
import { DesktopFooter } from "@/components/layout/desktop/DesktopFooter";
import { AppHeader } from "@/components/app-shell/AppHeader";
import { AppSidebar } from "@/components/app-shell/AppSidebar";
import { MobileBottomNavigation } from "@/components/app-shell/MobileBottomNavigation";
import {
  resolveAppPersona,
  resolveAppShellZone,
} from "@/components/app-shell/nav-config";
import { useVauto } from "@/context/VautoContext";
import { useShellChrome } from "@/hooks/useShellChrome";
import { useLayoutMode } from "@/context/LayoutModeContext";
import { cn } from "@/lib/cn";

interface VautoAdaptiveLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
  /** Light inner pages (chats, profile) vs home split layout */
  variant?: "home" | "plain";
}

function AdaptiveShellInner({
  children,
  hideNav = false,
  variant = "home",
}: VautoAdaptiveLayoutProps) {
  const shell = useShellChrome();
  const { isDesktop } = useLayoutMode();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const { user, isAuthenticated } = useVauto();
  const persona = resolveAppPersona(user, isAuthenticated);
  const zone = resolveAppShellZone(pathname, search, user, isAuthenticated);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const navHidden = hideNav || shell.hideBottomNav;
  const isPlain = variant === "plain";
  const hasSidebar = zone === "business" || zone === "control-center";

  const openSidebar = useCallback(() => setMobileSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  return (
    <div
      data-app-shell
      data-zone={zone}
      data-persona={persona}
      className={cn(
        "flex min-h-dvh flex-col transition-colors duration-300",
        isDesktop
          ? "vauto-desktop-portal bg-[var(--anonser-bg)] text-[var(--anonser-text)]"
          : "bg-[var(--vauto-bg)] text-[var(--vauto-text-main)]"
      )}
    >
      <AppHeader
        zone={zone}
        showSidebarToggle={hasSidebar}
        onOpenSidebar={openSidebar}
      />

      <div className="flex min-h-0 flex-1">
        {hasSidebar ? (
          <AppSidebar
            zone={zone}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={closeSidebar}
          />
        ) : null}

        <div
          data-app-content
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            !navHidden && !isDesktop && "pb-[calc(4.25rem+env(safe-area-inset-bottom))]"
          )}
        >
          {isDesktop ? (
            <div className="vauto-adaptive-content mx-auto flex w-full max-w-[var(--anonser-desktop-max)] flex-1 flex-col px-4 py-4 md:px-8 md:py-6">
              <SyncErrorBanner />
              {children}
            </div>
          ) : (
            <div
              className={cn(
                "mx-auto flex w-full max-w-lg flex-1 flex-col md:max-w-7xl",
                isPlain && "px-4 pt-4 md:px-6",
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
          )}

          {isDesktop ? <DesktopFooter /> : null}
        </div>
      </div>

      {!navHidden && !isDesktop ? <MobileBottomNavigation /> : null}
      {!navHidden && !isDesktop ? <InstallAppBanner /> : null}
    </div>
  );
}

/**
 * Adaptive shell — App Shell 2.0 chrome (header / sidebar / bottom nav)
 * with legacy content padding preserved. Single-mount keeps SSE/search/agent streams.
 */
export function VautoAdaptiveLayout(props: VautoAdaptiveLayoutProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh flex-col bg-[var(--vauto-bg)]">
          <div className="h-14 border-b border-[var(--vauto-border)] md:h-16" />
          <div className="flex-1" />
        </div>
      }
    >
      <AdaptiveShellInner {...props} />
    </Suspense>
  );
}
