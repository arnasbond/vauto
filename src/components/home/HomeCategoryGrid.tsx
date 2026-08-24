"use client";

import { MARKETPLACE_VERTICALS } from "@/lib/marketplace-verticals";
import { cn } from "@/lib/cn";

type HomeCategoryGridProps = {
  onSelect: (query: string, label: string, slug: string) => void;
  className?: string;
};

export function HomeCategoryGrid({ onSelect, className }: HomeCategoryGridProps) {
  return (
    <div
      className={cn("mt-4 w-full max-w-3xl", className)}
      data-home-category-grid
    >
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--ds-text-muted)]">
        Kategorijos
      </p>
      <ul
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
        aria-label="Pagrindinės skelbimų kategorijos"
      >
        {MARKETPLACE_VERTICALS.map((vertical) => {
          const Icon = vertical.icon;
          return (
            <li key={vertical.id} className="min-h-0">
              <button
                type="button"
                data-vertical-id={vertical.id}
                data-canonical-vertical={vertical.canonicalId}
                onClick={() =>
                  onSelect(vertical.query, vertical.label, vertical.id)
                }
                className={cn(
                  "group relative flex h-full min-h-[5.25rem] w-full flex-col items-start justify-center gap-2 overflow-hidden rounded-2xl",
                  "border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] px-3.5 py-3 text-left",
                  "transition-[transform,box-shadow,border-color,background-color] duration-[180ms] ease-[var(--ds-ease)]",
                  "hover:-translate-y-px hover:border-[var(--ds-brand)]/40 hover:shadow-[var(--ds-shadow-sm)]",
                  "focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring-ai)]"
                )}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-[var(--ds-ai-soft)] opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-4 right-0 h-10 w-10 rounded-full border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-muted)]/40 blur-md transition-transform duration-200 group-hover:scale-110"
                />
                <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-brand-soft,#ecfdf5)] text-[var(--ds-brand)] transition-colors duration-150 group-hover:bg-[var(--ds-brand)] group-hover:text-white">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="relative text-[13px] font-semibold leading-tight text-[var(--ds-text-primary)]">
                  {vertical.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
