"use client";

import { Suspense, useCallback, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { cn } from "@/lib/cn";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNavigation } from "./MobileBottomNavigation";
import { PageContainer } from "./PageContainer";
import {
  resolveAppPersona,
  resolveAppShellZone,
  type AppShellZone,
} from "./nav-config";

export type AppShellProps = {
  children: ReactNode;
  /** Override auto zone detection */
  zone?: AppShellZone;
  showBottomNav?: boolean;
  contentWidth?: "compact" | "default" | "wide";
  /** When false, children render without PageContainer (legacy pages keep own padding) */
  wrapContent?: boolean;
  className?: string;
};

function AppShellInner({
  children,
  zone: zoneProp,
  showBottomNav = true,
  contentWidth = "wide",
  wrapContent = false,
  className,
}: AppShellProps) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const { user, isAuthenticated } = useVauto();
  const persona = resolveAppPersona(user, isAuthenticated);
  const zone = zoneProp ?? resolveAppShellZone(pathname, search, user, isAuthenticated);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const hasSidebar = zone === "business" || zone === "control-center";

  const openSidebar = useCallback(() => setMobileSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  return (
    <div
      data-app-shell
      data-zone={zone}
      data-persona={persona}
      className={cn(
        "flex min-h-dvh flex-col bg-[var(--ds-surface-page,var(--vauto-page-bg,var(--vauto-bg)))]",
        className
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
            showBottomNav &&
              "pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0"
          )}
        >
          {wrapContent ? (
            <PageContainer width={contentWidth}>{children}</PageContainer>
          ) : (
            children
          )}
        </div>
      </div>

      {showBottomNav ? <MobileBottomNavigation /> : null}
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[var(--ds-surface-page,var(--vauto-bg))]" />}>
      <AppShellInner {...props} />
    </Suspense>
  );
}

export { AppHeader } from "./AppHeader";
export { AppSidebar } from "./AppSidebar";
export { MobileBottomNavigation } from "./MobileBottomNavigation";
export { PageContainer, Breadcrumbs } from "./PageContainer";
export type {
  BreadcrumbItem,
  BreadcrumbsProps,
  PageContainerProps,
} from "./PageContainer";
export {
  resolveAppPersona,
  resolveAppShellZone,
  getPublicHeaderLinks,
  CONTROL_CENTER_NAV,
  BUSINESS_PORTAL_NAV,
  isNavItemActive,
  resolveMessagesHref,
} from "./nav-config";
export type { AppPersona, AppShellZone, NavItem } from "./nav-config";
