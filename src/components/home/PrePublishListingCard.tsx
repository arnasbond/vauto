"use client";

import { useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { formatPrice, MOCK_CATEGORY_LABELS } from "@/data/mockListings";
import { cn } from "@/lib/cn";
import type { PrePublishCardPayload } from "@/lib/pre-publish-validation";
import type { ListingCategory } from "@/lib/types";

export interface PrePublishListingCardProps {
  card: PrePublishCardPayload;
  publishing?: boolean;
  onPublish: (sourceRect: DOMRect) => void;
  className?: string;
}

function categoryLabel(category?: string): string {
  if (!category) return "Skelbimas";
  return MOCK_CATEGORY_LABELS[category as ListingCategory] ?? category;
}

function truncateDescription(text: string, max = 160): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

export function PrePublishListingCard({
  card,
  publishing = false,
  onPublish,
  className,
}: PrePublishListingCardProps) {
  const publishBtnRef = useRef<HTMLButtonElement>(null);

  const handlePublish = () => {
    const rect =
      publishBtnRef.current?.getBoundingClientRect() ??
      new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
    onPublish(rect);
  };

  return (
    <div
      className={cn(
        "pre-publish-listing-card w-full max-w-[min(100%,20.5rem)] overflow-hidden rounded-2xl border border-[var(--vauto-primary)]/20 bg-[var(--vauto-card-bg)] shadow-[0_12px_40px_rgba(15,23,42,0.12)] md:max-w-sm",
        className
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={card.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-xs text-slate-500">
            Nuotrauka
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
          {categoryLabel(card.category)}
        </span>
        <span className="absolute bottom-2 right-2 rounded-xl bg-[var(--vauto-primary)] px-2.5 py-1 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] shadow-md">
          {formatPrice(card.price, card.priceLabel)}
        </span>
      </div>

      <div className="space-y-2 p-3.5">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--vauto-text)]">
          {card.title}
        </h3>
        <p className="flex items-center gap-1 text-xs font-medium text-[var(--vauto-text-muted)]">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--vauto-primary)]" aria-hidden />
          {card.location}
        </p>
        {card.description ? (
          <p className="line-clamp-3 text-[12px] leading-relaxed text-[var(--vauto-text-muted)]">
            {truncateDescription(card.description)}
          </p>
        ) : null}

        <button
          ref={publishBtnRef}
          type="button"
          disabled={publishing}
          onClick={handlePublish}
          className="mt-1 flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] shadow-md transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
        >
          {publishing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Publikuojama…
            </>
          ) : (
            <>🚀 Patvirtinti ir publikuoti</>
          )}
        </button>
      </div>
    </div>
  );
}
