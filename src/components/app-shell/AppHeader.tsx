"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu, Plus, Search, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { UserProfileDropdown } from "@/components/layout/UserProfileDropdown";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeQuickControl } from "@/components/app-shell/ThemeQuickControl";
import { Button, IconButton, Badge } from "@/design-system";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { cn } from "@/lib/cn";
import {
  getPublicHeaderLinks,
  isNavItemActive,
  resolveAppPersona,
  type AppShellZone,
} from "./nav-config";

type AppHeaderProps = {
  zone?: AppShellZone;
  onOpenSidebar?: () => void;
  showSidebarToggle?: boolean;
};

export function AppHeader({
  zone = "marketplace",
  onOpenSidebar,
  showSidebarToggle = false,
}: AppHeaderProps) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const router = useRouter();
  const { requireAuthForListing, isAuthenticated, user, isAdmin } = useVauto();
  const { resetHomeAgentSession, openAiSellerListingChat } = useVautoAgent();

  const persona = resolveAppPersona(user, isAuthenticated);
  const links = useMemo(() => getPublicHeaderLinks(persona), [persona]);

  const handleHomeNav = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      resetHomeAgentSession();
      if (pathname !== "/" && pathname !== "") router.push("/");
    },
    [pathname, resetHomeAgentSession, router]
  );

  const handleAddListing = useCallback(() => {
    if (!requireAuthForListing("/")) return;
    void openAiSellerListingChat({ navigateHome: true });
  }, [openAiSellerListingChat, requireAuthForListing]);

  const handleSearch = useCallback(() => {
    router.push("/search/");
  }, [router]);

  const zoneLabel =
    zone === "control-center"
      ? "Control Center"
      : zone === "business"
        ? "Verslo portalas"
        : null;

  return (
    <header
      data-app-header
      className={cn(
        "ds-glass sticky top-0 z-40 border-b border-[var(--ds-border-subtle,var(--vauto-border-subtle))]",
        "shadow-[var(--ds-shadow-xs)]",
        "transition-[background-color,box-shadow] duration-[var(--ds-duration-hover,160ms)]"
      )}
    >
      <div className="mx-auto flex h-14 max-w-[var(--anonser-desktop-max,80rem)] items-center gap-3 px-4 md:h-16 md:gap-6 md:px-6">
        {showSidebarToggle ? (
          <IconButton
            label="Atidaryti meniu"
            tone="muted"
            className="md:hidden"
            onClick={onOpenSidebar}
          >
            <Menu className="h-5 w-5" />
          </IconButton>
        ) : null}

        <Link
          href="/"
          onClick={handleHomeNav}
          className="flex shrink-0 items-center gap-2 transition-opacity duration-[var(--ds-duration-fast)] hover:opacity-90"
          aria-label="VAUTO pradžia"
        >
          <BrandLogo className="text-[1.2rem]" />
          {isAdmin ? (
            <Badge tone="ai" className="hidden sm:inline-flex">
              AI
            </Badge>
          ) : (
            <span
              className="hidden h-2 w-2 rounded-full bg-[var(--ds-success,#059669)] sm:inline-block"
              title="Sistema aktyvi"
              aria-hidden
            />
          )}
        </Link>

        {zoneLabel ? (
          <p className="ds-label hidden truncate text-[var(--ds-text-muted)] lg:block">
            {zoneLabel}
          </p>
        ) : (
          <nav
            className="hidden flex-1 items-center justify-center gap-1 md:flex"
            aria-label="Pagrindinė navigacija"
          >
            {links.map((item) => {
              const active = isNavItemActive(item, pathname, search);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={item.href === "/" ? handleHomeNav : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-[var(--ds-radius-control)] px-3 py-2 text-[length:var(--ds-text-body-sm-size)] font-semibold transition-colors duration-[var(--ds-duration-normal)]",
                    active
                      ? "bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]"
                      : "text-[var(--ds-text-muted)] hover:bg-[var(--ds-surface-muted)] hover:text-[var(--ds-text-primary)]"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2">
          {zone === "marketplace" ? (
            <div className="hidden md:block">
              <IconButton
                label="Paieška / AI"
                tone="ai"
                onClick={handleSearch}
              >
                <Search className="h-4 w-4" />
              </IconButton>
            </div>
          ) : null}

          <div className="hidden md:block">
            <Button
              data-nav-add-listing
              variant={zone === "marketplace" ? "ai" : "primary"}
              size="sm"
              leftIcon={
                zone === "marketplace" ? (
                  <Sparkles className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )
              }
              onClick={handleAddListing}
            >
              Įdėti
            </Button>
          </div>
          <div className="md:hidden">
            <Button
              data-nav-add-listing
              variant="primary"
              size="sm"
              iconOnly
              aria-label="Įdėti skelbimą"
              onClick={handleAddListing}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ThemeQuickControl />
          <NotificationBell />
          <div className="hidden md:block">
            <UserProfileDropdown variant="desktop" />
          </div>
          <div className="md:hidden">
            <UserProfileDropdown variant="mobile" />
          </div>
        </div>
      </div>
    </header>
  );
}
