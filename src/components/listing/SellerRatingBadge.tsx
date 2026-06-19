"use client";

import { Star } from "lucide-react";
import { computeSellerRating } from "@/lib/reviews";
import type { SellerReview } from "@/lib/types";

interface SellerRatingBadgeProps {
  sellerId: string;
  reviews: SellerReview[];
  compact?: boolean;
}

export function SellerRatingBadge({
  sellerId,
  reviews,
  compact = false,
}: SellerRatingBadgeProps) {
  const { avg, count } = computeSellerRating(reviews, sellerId);
  if (count === 0) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
        {avg} ({count})
      </span>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < Math.round(avg)
                ? "fill-amber-400 text-amber-400"
                : "text-white/20"
            }`}
          />
        ))}
      </div>
      <span className="text-sm text-white">
        {avg}{" "}
        <span className="text-[var(--vauto-text-muted)]">
          ({count} atsiliepim{count === 1 ? "as" : count < 10 ? "ai" : "ų"})
        </span>
      </span>
    </div>
  );
}
