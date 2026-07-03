"use client";

import { getAnonserNavLinks, getAnonserPortalUrl } from "@/lib/anonser-links";

export function DesktopFooter() {
  const anonserUrl = getAnonserPortalUrl();
  const links = getAnonserNavLinks();

  return (
    <footer className="mt-auto border-t border-[var(--anonser-border)] bg-[var(--anonser-surface-muted)]">
      <div className="mx-auto flex max-w-[var(--anonser-desktop-max)] flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-sm font-bold text-[var(--anonser-text)]">
            VAUTO × anonser.lt
          </p>
          <p className="mt-1 text-xs text-[var(--anonser-text-muted)]">
            AI skelbimų ir paslaugų platforma — integruota į{" "}
            <a
              href={anonserUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--anonser-primary)] hover:underline"
            >
              anonser.lt
            </a>
          </p>
        </div>
        <nav className="flex flex-wrap gap-4" aria-label="Portalo nuorodos">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[var(--anonser-text-muted)] hover:text-[var(--anonser-primary)]"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
