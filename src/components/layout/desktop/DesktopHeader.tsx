"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Building2,
  Home,
  LayoutGrid,
  MessageCircle,
  Plus,
  User,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useVauto } from "@/context/VautoContext";
import { useChat } from "@/context/ChatContext";
import { countUnreadChats } from "@/lib/chat-helpers";
import {
  getAnonserLogoSrc,
  getAnonserNavLinks,
  getAnonserPortalUrl,
} from "@/lib/anonser-links";
import { cn } from "@/lib/cn";
import {
  cabinetNavLabel,
  defaultCabinetPath,
  isBusinessProfile,
} from "@/lib/profile-type";

const VAUTO_NAV = [
  { href: "/", label: "Skelbimai", icon: Home },
  { href: "/mano-skelbimai/", label: "Mano skelbimai", icon: LayoutGrid },
  { href: "/chats/", label: "Pokalbiai", icon: MessageCircle },
] as const;

const INTENT_NAV = [
  { href: "/", label: "Pirkti", match: (p: string) => p === "/" || p === "" },
  { href: "/add/", label: "Parduoti", match: (p: string) => p.startsWith("/add") },
  { href: "/verslui/", label: "Verslui", match: (p: string) => p.startsWith("/verslui") },
  {
    href: "/mano-skelbimai/",
    label: "Viskas",
    match: (p: string) =>
      p.startsWith("/mano-skelbimai") ||
      p.startsWith("/fashion") ||
      p.startsWith("/discover"),
  },
] as const;

export function DesktopHeader() {
  const pathname = usePathname();
  const { isAuthenticated, user, openAuthModal } = useVauto();
  const { chats } = useChat();
  const unread = countUnreadChats(chats, user?.id ?? "");
  const anonserUrl = getAnonserPortalUrl();
  const logoSrc = getAnonserLogoSrc();
  const portalLinks = getAnonserNavLinks();

  return (
    <header className="desktop-header sticky top-0 z-40 border-b border-[var(--anonser-border)] bg-[var(--anonser-header-bg)]/95 shadow-[0_1px_0_rgba(15,23,42,0.05),0_12px_40px_-20px_rgba(15,23,42,0.18)] backdrop-blur-xl">
      <div className="border-b border-[var(--anonser-border)]/60 bg-[var(--anonser-surface-muted)]/45">
        <div className="mx-auto flex max-w-[var(--anonser-desktop-max)] items-center justify-center gap-1.5 px-6 py-2">
          {INTENT_NAV.map(({ href, label, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide transition",
                  active
                    ? "bg-[var(--anonser-card)] text-[var(--anonser-primary)] shadow-sm ring-1 ring-[var(--anonser-border)]"
                    : "text-[var(--anonser-text-muted)] hover:bg-[var(--anonser-card)]/70 hover:text-[var(--anonser-text)]"
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mx-auto flex h-16 max-w-[var(--anonser-desktop-max)] items-center gap-5 px-6">
        <div className="flex shrink-0 items-center gap-3">
          <a
            href={anonserUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--anonser-text-muted)] transition hover:bg-[var(--anonser-surface-muted)] hover:text-[var(--anonser-text)]"
            title="Grįžti į anonser.lt"
          >
            {logoSrc ? (
              <Image
                src={logoSrc}
                alt="anonser.lt"
                width={28}
                height={28}
                className="rounded"
                unoptimized
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--anonser-primary)] text-xs font-bold text-white">
                A
              </span>
            )}
            <span className="hidden lg:inline">anonser.lt</span>
          </a>
          <span className="text-[var(--anonser-border)]" aria-hidden>
            /
          </span>
          <Link
            href="/"
            className="font-display text-xl font-bold tracking-tight text-[var(--anonser-text)]"
          >
            VAUTO
          </Link>
        </div>

        <nav
          className="hidden items-center gap-0.5 xl:flex"
          aria-label="anonser.lt navigacija"
        >
          {portalLinks.slice(1, 5).map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--anonser-text-muted)] transition hover:bg-[var(--anonser-surface-muted)] hover:text-[var(--anonser-text)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <nav className="ml-auto flex items-center gap-1" aria-label="VAUTO">
          {VAUTO_NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/" || pathname === ""
                : pathname.startsWith(href.replace(/\/$/, ""));
            const badge = href.includes("chats") && unread > 0 ? unread : 0;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                  active
                    ? "bg-[var(--anonser-primary-soft)] text-[var(--anonser-primary)] shadow-sm"
                    : "text-[var(--anonser-text-muted)] hover:bg-[var(--anonser-surface-muted)] hover:text-[var(--anonser-text)]"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {badge > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--anonser-accent)] px-1 text-[10px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
          {isBusinessProfile(user) && (
            <Link
              href="/verslui/"
              className={cn(
                "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                pathname.startsWith("/verslui")
                  ? "bg-[var(--anonser-primary-soft)] text-[var(--anonser-primary)]"
                  : "text-[var(--anonser-text-muted)] hover:bg-[var(--anonser-surface-muted)]"
              )}
            >
              <Building2 className="h-4 w-4" />
              Verslui
            </Link>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2 border-l border-[var(--anonser-border)] pl-4">
          <Link
            href="/add/"
            className="hidden items-center gap-1.5 rounded-xl bg-[var(--anonser-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 sm:inline-flex"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Įdėti
          </Link>
          <NotificationBell />
          {isAuthenticated ? (
            <Link
              href={defaultCabinetPath(user?.profileType)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--anonser-text)] transition hover:bg-[var(--anonser-surface-muted)]"
            >
              <User className="h-4 w-4" />
              <span className="max-w-[120px] truncate">
                {user?.firstName || cabinetNavLabel(user?.profileType)}
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal("/")}
              className="rounded-xl border border-[var(--anonser-border)] bg-[var(--anonser-card)] px-4 py-2 text-sm font-semibold text-[var(--anonser-text)] transition hover:border-[var(--anonser-primary)]/30 hover:text-[var(--anonser-primary)]"
            >
              Prisijungti
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
