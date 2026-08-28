"use client";

import { useState } from "react";
import Image from "next/image";
import { MARKETPLACE_VERTICALS } from "@/lib/marketplace-verticals";
import { CATEGORY_IMAGE_SRC } from "@/lib/category-imagery";
import { cn } from "@/lib/cn";

type HomeCategoryGridProps = {
  onSelect: (query: string, label: string, slug: string) => void;
  className?: string;
  /** Live listing counts per vertical — omitted/undefined verticals hide the count line. */
  counts?: Partial<Record<(typeof MARKETPLACE_VERTICALS)[number]["id"], number>>;
};

function formatListingCount(count: number): string {
  return `${count.toLocaleString("lt-LT")} skelbim${count === 1 ? "as" : count >= 2 && count <= 9 ? "ai" : "ų"}`;
}

function CategoryVisual({
  vertical,
}: {
  vertical: (typeof MARKETPLACE_VERTICALS)[number];
}) {
  const [broken, setBroken] = useState(false);
  const image = CATEGORY_IMAGE_SRC[vertical.id];
  const Icon = vertical.icon;

  if (broken || !image) {
    return (
      <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-brand-soft,#ecfdf5)] text-[var(--ds-brand)] sm:h-20 sm:w-20">
        <Icon className="h-8 w-8" aria-hidden />
      </span>
    );
  }

  return (
    <div className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-end justify-center sm:h-[5.25rem] sm:w-[5.25rem] lg:h-24 lg:w-24">
      {/* Restrained grounding contact-shadow — an intentional, consistent
          "object on a surface" cue independent of each asset's own faint
          baked-in shadow, per MASTER's object-grounding depth cue. */}
      <div
        aria-hidden
        className="absolute bottom-[6%] h-[12%] w-[58%] rounded-[50%]"
        style={{ background: "var(--cc-contact-shadow)", filter: "blur(4px)" }}
      />
      <Image
        src={image.webp2x}
        alt={image.alt}
        width={160}
        height={160}
        loading="lazy"
        className="relative h-full w-full object-contain drop-shadow-[0_5px_8px_rgba(0,0,0,0.14)] transition-transform duration-200 ease-[var(--ds-ease)] group-hover:scale-[1.06]"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

export function HomeCategoryGrid({ onSelect, className, counts }: HomeCategoryGridProps) {
  return (
    <div
      className={cn("mt-4 w-full max-w-3xl", className)}
      data-home-category-grid
    >
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--ds-text-muted)]">
        Kategorijos
      </p>
      <ul
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
        aria-label="Pagrindinės skelbimų kategorijos"
      >
        {MARKETPLACE_VERTICALS.map((vertical) => {
          const count = counts?.[vertical.id];
          return (
            <li key={vertical.id} className="min-h-0">
              {/*
                The count caption is a SIBLING of <button>, not a descendant —
                Stage 12B comprehension tests assert the button's exact
                accessible text equals the canonical vertical label (e.g.
                "Transportas"), so live listing counts must live outside the
                button's text-content subtree while staying visually inside
                the same card.
              */}
              <div
                className={cn(
                  "group relative flex h-full min-h-[8.25rem] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl",
                  "border border-[var(--ds-border-subtle)] px-2 py-3 text-center",
                  "transition-[transform,box-shadow,border-color] duration-[180ms] ease-[var(--ds-ease)]",
                  "hover:-translate-y-px hover:border-[var(--ds-brand)]/40 hover:shadow-[var(--ds-shadow-sm)]"
                )}
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in srgb, white var(--cc-top-mix), var(--ds-surface-elevated)) 0%, var(--ds-surface-card) 60%, color-mix(in srgb, black var(--cc-floor-mix), var(--ds-surface-card)) 100%)",
                  boxShadow: `var(--ds-shadow-xs), inset 0 1px 0 var(--cc-inset-highlight)`,
                }}
              >
                {/* Local light falloff — soft top-center highlight, theme-safe. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(120% 55% at 50% -10%, color-mix(in srgb, white 10%, transparent), transparent 70%)",
                  }}
                />
                <button
                  type="button"
                  data-vertical-id={vertical.id}
                  data-canonical-vertical={vertical.canonicalId}
                  onClick={() =>
                    onSelect(vertical.query, vertical.label, vertical.id)
                  }
                  className="flex w-full flex-col items-center gap-2 rounded-xl outline-none focus-visible:shadow-[var(--ds-focus-ring-ai)]"
                >
                  <CategoryVisual vertical={vertical} />
                  <span className="text-[12px] font-semibold leading-tight text-[var(--ds-text-primary)]">
                    {vertical.label}
                  </span>
                </button>
                {typeof count === "number" && count > 0 ? (
                  <span className="text-[10px] font-medium leading-tight text-[var(--ds-text-muted)]">
                    {formatListingCount(count)}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
