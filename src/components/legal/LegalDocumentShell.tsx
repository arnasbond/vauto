import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";

export function LegalDocumentShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <AppShell variant="plain">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Header />
        <article className="vauto-dashboard-card mt-4 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-6 text-[var(--vauto-text)]">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
            Atnaujinta: {updated} · VAUTO — nacionalinė skelbimų platforma
          </p>
          <div className="prose-vauto mt-6 space-y-4 text-sm leading-relaxed text-[var(--vauto-text-muted)]">
            {children}
          </div>
          <p className="mt-8 border-t border-[var(--vauto-border)] pt-4 text-xs text-[var(--vauto-text-muted)]">
            <Link href="/" className="text-[var(--vauto-teal)] underline">
              Grįžti į VAUTO
            </Link>
            {" · "}
            <Link href="/apie/" className="underline">
              Apie
            </Link>
            {" · "}
            <Link href="/privatumas/" className="underline">
              Privatumas
            </Link>
            {" · "}
            <Link href="/taisykles/" className="underline">
              Taisyklės
            </Link>
          </p>
        </article>
      </div>
    </AppShell>
  );
}
