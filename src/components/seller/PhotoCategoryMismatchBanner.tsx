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
      className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
      role="alert"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center gap-2 text-amber-900">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide">AI pastaba</p>
      </div>
      <p className="text-sm leading-relaxed text-slate-800">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-full bg-[#1167b1] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0d5a9a]"
        >
          {chips[1]}
        </button>
        <button
          type="button"
          onClick={onRevert}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition hover:border-slate-400"
        >
          {chips[0]}
        </button>
      </div>
    </div>
  );
}
