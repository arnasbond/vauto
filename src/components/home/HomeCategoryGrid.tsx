"use client";

import { useState } from "react";
// F8 — plain <img> with responsive srcSet (next/image unoptimized = no srcset).
import { HOME_CATEGORIES, type HomeCategory } from "@/lib/marketplace-verticals";
import { categoryImageFor } from "@/lib/category-imagery";
import { cn } from "@/lib/cn";

type HomeCategoryGridProps = {
  onSelect: (query: string, label: string, slug: string) => void;
  className?: string;
  /** Live listing counts per category — omitted/undefined categories hide the count line. */
  counts?: Partial<Record<(typeof HOME_CATEGORIES)[number]["id"], number>>;
};

function formatListingCount(count: number): string {
  return `${count.toLocaleString("lt-LT")} skelbim${count === 1 ? "as" : count >= 2 && count <= 9 ? "ai" : "ų"}`;
}

function CategoryVisual({ category }: { category: HomeCategory }) {
  const [broken, setBroken] = useState(false);
  const image = categoryImageFor(category.id);
  const Icon = category.icon;

  // The Lucide icon is ONLY the broken/missing-image fallback — a healthy
  // premium illustration must render an <img>.
  if (broken || !image) {
    return (
      <span className="inline-flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-[var(--ds-brand-soft,#ecfdf5)] text-[var(--ds-brand)] sm:h-[5.25rem] sm:w-[5.25rem] lg:h-24 lg:w-24">
        <Icon className="h-8 w-8" aria-hidden />
      </span>
    );
  }

  return (
    <div
      data-category-image-zone
      className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-end justify-center sm:h-[5.25rem] sm:w-[5.25rem] lg:h-24 lg:w-24"
    >
      {/* Restrained grounding contact-shadow — an intentional, consistent
          "object on a surface" cue independent of each asset's own faint
          baked-in shadow, per MASTER's object-grounding depth cue. */}
      <div
        aria-hidden
        className="absolute bottom-[6%] h-[12%] w-[58%] rounded-[50%]"
        style={{ background: "var(--cc-contact-shadow)", filter: "blur(4px)" }}
      />
      {/* F8 — responsive media: the 1x file (240px) goes to standard-DPI
          screens, the @2x (480px) only to retina. Same premium geometry. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.webp2x}
        srcSet={`${image.webp} 1x, ${image.webp2x} 2x`}
        sizes="96px"
        alt={image.alt}
        width={160}
        height={160}
        loading="lazy"
        decoding="async"
        className="relative h-full w-full object-contain drop-shadow-[0_5px_8px_rgba(0,0,0,0.14)] transition-transform duration-200 ease-[var(--ds-ease)] group-hover:scale-[1.06]"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

export function HomeCategoryGrid({ onSelect, className, counts }: HomeCategoryGridProps) {
  return (
    <div
      className={cn("mt-4 w-full max-w-4xl", className)}
      data-home-category-grid
    >
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--ds-text-muted)]">
        Kategorijos
      </p>
      <ul
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4"
        aria-label="Pagrindinės skelbimų kategorijos"
      >
        {HOME_CATEGORIES.map((category) => {
          const count = counts?.[category.id];
          return (
            <li key={category.id} className="min-h-0">
              {/*
                The count caption is a SIBLING of <button>, not a descendant —
                Stage 12B comprehension tests assert the button's exact
                accessible text equals the canonical category label (e.g.
                "Transportas"), so live listing counts must live outside the
                button's text-content subtree while staying visually inside
                the same card.
              */}
              <div
                data-category-card
                data-category-card-id={category.id}
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
                  data-category-id={category.id}
                  data-vertical-id={category.id}
                  onClick={() =>
                    onSelect(category.query, category.label, category.id)
                  }
                  className="flex w-full flex-col items-center gap-2 rounded-xl outline-none focus-visible:shadow-[var(--ds-focus-ring-ai)]"
                >
                  <CategoryVisual category={category} />
                  {/* Titles wrap controllably (max 2 lines) so every card
                      keeps the same height regardless of name length. */}
                  <span className="line-clamp-2 min-h-[2.1rem] break-words text-[12px] font-semibold leading-tight text-[var(--ds-text-primary)]">
                    {category.label}
                  </span>
                </button>
                {/* Reserved count zone — uniform across cards with/without counts. */}
                <span className="min-h-[1rem] text-[10px] font-medium leading-tight text-[var(--ds-text-muted)]">
                  {typeof count === "number" && count > 0
                    ? formatListingCount(count)
                    : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
