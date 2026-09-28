"use client";

import Link from "next/link";
import { FileQuestion, Home, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] shadow-[var(--ds-shadow-sm)]">
          <FileQuestion className="h-8 w-8 text-[var(--ds-brand)]" aria-hidden />
        </div>

        <h1 className="mt-6 font-[family-name:var(--font-outfit)] text-2xl font-bold text-[var(--ds-text-primary)] sm:text-3xl">
          404 — Puslapis nerastas
        </h1>

        <p className="mt-2.5 max-w-md text-sm leading-relaxed text-[var(--ds-text-secondary)]">
          Puslapis, kurio ieškote, neegzistuoja arba buvo perkeltas. Naudokitės VAUTO paieška arba grįžkite į pradžią.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--ds-radius-control)] bg-[var(--ds-brand)] px-5 text-sm font-semibold text-[var(--ds-brand-contrast)] transition hover:bg-[var(--ds-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]"
          >
            <Home className="h-4 w-4" aria-hidden />
            Grįžti į Pradžią
          </Link>
          <Link
            href="/search/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] px-5 text-sm font-semibold text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]"
          >
            <Search className="h-4 w-4 text-[var(--ds-text-secondary)]" aria-hidden />
            Atidaryti Paiešką
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
