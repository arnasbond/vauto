"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Camera, LayoutGrid, Sparkles, Upload } from "lucide-react";

interface DesktopWardrobeLayoutProps {
  children: ReactNode;
  header?: ReactNode;
}

/**
 * Desktop Spinta scaffold — sidebar quick actions + wide cabinet content.
 * Mobile never renders this component.
 */
export function DesktopWardrobeLayout({ children, header }: DesktopWardrobeLayoutProps) {
  return (
    <div className="flex gap-8">
      <aside
        className="hidden w-[var(--anonser-sidebar-width)] shrink-0 lg:block"
        aria-label="Spintos veiksmai"
      >
        <div className="sticky top-[calc(var(--anonser-header-height)+1.5rem)] space-y-4">
          <section className="overflow-hidden rounded-2xl border border-[var(--anonser-border)] bg-[var(--anonser-card)] shadow-sm">
            <div className="border-b border-[var(--anonser-border)] bg-gradient-to-br from-[var(--anonser-primary-soft)] to-[var(--anonser-card)] px-4 py-4">
              <div className="flex items-center gap-2 text-[var(--anonser-primary)]">
                <LayoutGrid className="h-4 w-4" aria-hidden />
                <h2 className="text-sm font-bold tracking-tight">Mano skelbimai</h2>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--anonser-text-muted)]">
                Valdykite skelbimus, statistiką ir redagavimą pokalbiu su DI.
              </p>
            </div>
            <div className="space-y-2 p-4">
              <Link
                href="/add/?vertical=fashion"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--anonser-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
              >
                <Upload className="h-4 w-4" aria-hidden />
                Įkelti prekę
              </Link>
              <Link
                href="/add/?vertical=fashion"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--anonser-border)] bg-[var(--anonser-surface-muted)]/50 px-4 py-2.5 text-sm font-medium text-[var(--anonser-text)] transition hover:border-[var(--anonser-primary)]/40"
              >
                <Camera className="h-4 w-4 text-[var(--anonser-accent)]" aria-hidden />
                Nuotraukų krepšelis
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-[var(--anonser-accent)]/35 bg-[var(--anonser-card)] p-4">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--anonser-accent)]" />
              <p className="text-xs leading-relaxed text-[var(--anonser-text-muted)]">
                Prijunkite Vinted, Depop ar kitus portalus — VAUTO sinchronizuos kainas ir
                aprašymus automatiškai.
              </p>
            </div>
          </section>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {header}
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
