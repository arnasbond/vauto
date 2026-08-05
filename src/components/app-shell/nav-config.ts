import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Briefcase,
  ClipboardList,
  CreditCard,
  Home,
  LayoutDashboard,
  MessageSquareWarning,
  Search,
  Settings,
  Shield,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { isSuperAdminUser } from "@/lib/admin-access";
import { hasBusinessPortalAccess } from "@/lib/business-portal-access";

export type AppShellZone = "marketplace" | "business" | "control-center";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Exact or prefix match for active state */
  match?: "exact" | "prefix";
  badgeKey?: "moderation" | "chats";
};

export type AppPersona = "guest" | "buyer" | "seller" | "business" | "admin";

export function resolveAppPersona(
  user: UserProfile | null | undefined,
  isAuthenticated: boolean
): AppPersona {
  if (!isAuthenticated || !user) return "guest";
  if (isSuperAdminUser(user)) return "admin";
  if (hasBusinessPortalAccess(user)) return "business";
  if (user.role === "pro" || user.profileType === "business") return "business";
  // Private authenticated users buy + sell in the same cabinet.
  return "buyer";
}

export function resolveAppShellZone(
  pathname: string,
  search: string,
  user: UserProfile | null | undefined,
  isAuthenticated: boolean
): AppShellZone {
  const path = pathname || "/";
  const tab = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  ).get("tab");
  const persona = resolveAppPersona(user, isAuthenticated);

  if (
    isAuthenticated &&
    isSuperAdminUser(user) &&
    (path.startsWith("/admin") ||
      path.startsWith("/profile") ||
      path === "/profile/")
  ) {
    // Personal seller cabinet tabs stay marketplace chrome.
    if (tab === "cabinet" || tab === "ai") return "marketplace";
    if (path.startsWith("/profile/settings")) return "control-center";
    return "control-center";
  }

  if (
    path.startsWith("/verslui") ||
    path.startsWith("/pro-registration") ||
    (persona === "business" &&
      (path.startsWith("/mano-skelbimai") || path.startsWith("/verslui")))
  ) {
    return "business";
  }

  return "marketplace";
}

/** Canonical messages entry (real route used across app). */
export function resolveMessagesHref(): string {
  return "/messages/";
}

/** Public top-nav links (only real routes). */
export function getPublicHeaderLinks(persona: AppPersona): NavItem[] {
  const links: NavItem[] = [
    { id: "home", label: "Skelbimai", href: "/", icon: Home, match: "exact" },
    { id: "search", label: "Paieška", href: "/search/", icon: Search, match: "prefix" },
  ];
  if (persona === "guest") return links;
  links.push({
    id: "cabinet",
    label: "Mano skelbimai",
    href: "/mano-skelbimai/",
    icon: Store,
    match: "prefix",
  });
  if (persona === "business" || persona === "admin") {
    links.push({
      id: "business",
      label: "Verslui",
      href: "/verslui/",
      icon: Briefcase,
      match: "prefix",
    });
  }
  if (persona === "admin") {
    links.push({
      id: "cc",
      label: "Control Center",
      href: "/profile/?tab=moderation",
      icon: Shield,
      match: "prefix",
    });
  }
  return links;
}

/**
 * Control Center sidebar — only bookmarkable admin destinations that exist today.
 * (No inventing Vartotojai / other routes that are not wired.)
 */
export const CONTROL_CENTER_NAV: NavItem[] = [
  {
    id: "cc-overview",
    label: "Apžvalga",
    href: "/profile/?tab=ops",
    icon: LayoutDashboard,
    match: "prefix",
  },
  {
    id: "cc-reports",
    label: "Pranešimai",
    href: "/profile/?tab=moderation",
    icon: MessageSquareWarning,
    match: "prefix",
  },
  {
    id: "cc-moderation",
    label: "Moderacija",
    href: "/profile/?tab=listings",
    icon: ClipboardList,
    match: "prefix",
  },
  {
    id: "cc-system",
    label: "Sistemos būsena",
    href: "/profile/?tab=ops",
    icon: BarChart3,
    match: "prefix",
  },
  {
    id: "cc-payments",
    label: "Mokėjimai",
    href: "/profile/settings/?focus=payments",
    icon: CreditCard,
    match: "prefix",
  },
  // Note: Apžvalga + Sistemos būsena share tab=ops (AdminOpsPanel). Both stay visible per IA.
  {
    id: "cc-ai",
    label: "AI kontekstas",
    href: "/profile/?tab=agent",
    icon: Bot,
    match: "prefix",
  },
  {
    id: "cc-account",
    label: "Paskyros",
    href: "/profile/?tab=account",
    icon: UserRound,
    match: "prefix",
  },
  {
    id: "cc-settings",
    label: "Nustatymai",
    href: "/profile/settings/",
    icon: Settings,
    match: "prefix",
  },
];

/**
 * Business portal sidebar — real destinations + in-portal section anchors.
 */
export const BUSINESS_PORTAL_NAV: NavItem[] = [
  {
    id: "biz-overview",
    label: "Apžvalga",
    href: "/verslui/",
    icon: LayoutDashboard,
    match: "exact",
  },
  {
    id: "biz-listings",
    label: "Skelbimai",
    href: "/mano-skelbimai/",
    icon: Store,
    match: "prefix",
  },
  {
    id: "biz-analytics",
    label: "Analitika",
    href: "/verslui/?section=analytics",
    icon: BarChart3,
    match: "exact",
  },
  {
    id: "biz-leads",
    label: "Leads",
    href: "/verslui/?section=leads",
    icon: MessageSquareWarning,
    match: "exact",
  },
  {
    id: "biz-import",
    label: "Importas",
    href: "/verslui/?section=import",
    icon: ClipboardList,
    match: "exact",
  },
  {
    id: "biz-ai",
    label: "AI rekomendacijos",
    href: "/verslui/?section=ai",
    icon: Sparkles,
    match: "exact",
  },
  {
    id: "biz-plan",
    label: "Planas",
    href: "/verslui/?section=plan",
    icon: CreditCard,
    match: "exact",
  },
  {
    id: "biz-settings",
    label: "Nustatymai",
    href: "/profile/settings/",
    icon: Settings,
    match: "prefix",
  },
];

export function isNavItemActive(
  item: NavItem,
  pathname: string,
  search: string
): boolean {
  const path =
    pathname.endsWith("/") && pathname.length > 1
      ? pathname
      : pathname.endsWith("/")
        ? pathname
        : `${pathname}/`;
  const currentSearch = search.startsWith("?")
    ? search
    : search
      ? `?${search}`
      : "";

  if (item.href.includes("?")) {
    const [itemPath, itemQuery] = item.href.split("?");
    const itemParams = new URLSearchParams(itemQuery);
    const curParams = new URLSearchParams(
      currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch
    );
    const pathOk =
      pathname === itemPath ||
      pathname === itemPath.replace(/\/$/, "") ||
      `${pathname}/` === itemPath;
    if (!pathOk) return false;
    const itemTab = itemParams.get("tab");
    if (itemTab) return curParams.get("tab") === itemTab;
    const itemFocus = itemParams.get("focus");
    if (itemFocus) return curParams.get("focus") === itemFocus;
    const itemSection = itemParams.get("section");
    if (itemSection) return curParams.get("section") === itemSection;
    return true;
  }

  if (item.match === "exact") {
    const pathMatch =
      pathname === item.href.replace(/\/$/, "") ||
      pathname === item.href ||
      path === item.href;
    if (!pathMatch) return false;
    // Business overview (/verslui/) should not stay active when a section is selected.
    if (
      (item.href === "/verslui/" || item.href === "/verslui") &&
      !item.href.includes("?")
    ) {
      const curParams = new URLSearchParams(
        currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch
      );
      return !curParams.get("section");
    }
    return true;
  }

  const base = item.href.replace(/\/$/, "");
  return pathname === base || pathname.startsWith(`${base}/`);
}

export const SIDEBAR_COLLAPSE_KEY = "vauto.shell.sidebarCollapsed";
