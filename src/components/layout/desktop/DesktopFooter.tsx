"use client";

import { getAnonserNavLinks } from "@/lib/anonser-links";

export function DesktopFooter() {
  const links = getAnonserNavLinks();

  return (
    <footer className="mt-auto border-t border-[var(--anonser-border)] bg-[var(--anonser-surface-muted)]">
      <div className="mx-auto flex max-w-[var(--anonser-desktop-max)] flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-sm font-bold text-[var(--anonser-text)]">
            VAUTO
          </p>
          <p className="mt-1 text-xs text-[var(--anonser-text-muted)]">
            AI skelbimų ir paslaugų platforma visoje Lietuvoje —{" "}
            <a
              href="https://www.vauto.lt"
              className="font-medium text-[var(--anonser-primary)] hover:underline"
            >
              www.vauto.lt
            </a>
          </p>
        </div>
        <nav className="flex flex-wrap gap-4" aria-label="Portalo nuorodos">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              {...(link.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
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
