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
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
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
                  "flex h-full min-h-[4.5rem] w-full flex-col items-start justify-center gap-1.5 rounded-2xl",
                  "border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] px-3 py-2.5 text-left",
                  "transition-[transform,border-color,background-color] duration-150",
                  "hover:-translate-y-px hover:border-[var(--ds-brand)]/35 hover:bg-[var(--ds-brand-soft,#eef2ff)]",
                  "focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring-ai)]"
                )}
              >
                <Icon
                  className="h-4 w-4 shrink-0 text-[var(--ds-brand)]"
                  aria-hidden
                />
                <span className="text-[13px] font-semibold leading-tight text-[var(--ds-text-primary)]">
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
