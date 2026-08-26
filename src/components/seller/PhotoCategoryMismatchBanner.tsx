"use client";

import { Sparkles } from "lucide-react";
import type { ListingCategory } from "@/lib/types";
import {
  buildSellerPhotoCategoryMismatchMessage,
  sellerPhotoCategoryMismatchQuickReplies,
} from "@/lib/seller-photo-category-mismatch";

export interface PhotoCategoryMismatchBannerProps {
  fromCategory: ListingCategory;
  toCategory: ListingCategory;
  onRevert: () => void;
  onAccept: () => void;
}

/** Inline AI intervention when uploaded photo disagrees with wizard vertical. */
export function PhotoCategoryMismatchBanner({
  fromCategory,
  toCategory,
  onRevert,
  onAccept,
}: PhotoCategoryMismatchBannerProps) {
  const message = buildSellerPhotoCategoryMismatchMessage(fromCategory, toCategory);
  const chips = sellerPhotoCategoryMismatchQuickReplies(fromCategory);

  return (
    <div
      className="mb-4 rounded-2xl border border-[var(--ds-warning)]/35 bg-[var(--ds-warning-soft)] p-4 shadow-sm"
      role="alert"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center gap-2 text-[var(--ds-warning)]">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide">AI pastaba</p>
      </div>
      <p className="text-sm leading-relaxed text-[var(--ds-text-primary)]">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-full bg-[var(--ds-brand)] px-4 py-2 text-xs font-semibold text-[var(--ds-brand-contrast)] transition hover:bg-[var(--ds-brand-hover)]"
        >
          {chips[1]}
        </button>
        <button
          type="button"
          onClick={onRevert}
          className="rounded-full border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-4 py-2 text-xs font-semibold text-[var(--ds-text-primary)] transition hover:border-[var(--ds-text-muted)]"
        >
          {chips[0]}
        </button>
      </div>
    </div>
  );
}
