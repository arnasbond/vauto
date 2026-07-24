"use client";

import { Star } from "lucide-react";
import {
  computeSellerRating,
  formatSellerRatingLabel,
} from "@/lib/reviews";
import { VerifiedSellerBadge } from "@/components/listing/VerifiedSellerBadge";
import type { AuthProvider, SellerReview, UserProfile } from "@/lib/types";

interface SellerRatingBadgeProps {
  sellerId: string;
  reviews: SellerReview[];
  compact?: boolean;
  showVerified?: boolean;
  authProvider?: AuthProvider | string | null;
  profile?: Pick<UserProfile, "authProvider" | "phone" | "email"> | null;
}

export function SellerRatingBadge({
  sellerId,
  reviews,
  compact = false,
  showVerified = true,
  authProvider,
  profile,
}: SellerRatingBadgeProps) {
  const { avg, count } = computeSellerRating(reviews, sellerId);
  if (count === 0) {
    return showVerified ? (
      <VerifiedSellerBadge
        sellerId={sellerId}
        reviews={reviews}
        authProvider={authProvider}
        profile={profile}
      />
    ) : null;
  }

  const label = formatSellerRatingLabel(avg, count);

  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          {label}
        </span>
        {showVerified ? (
          <VerifiedSellerBadge
            sellerId={sellerId}
            reviews={reviews}
            authProvider={authProvider}
            profile={profile}
          />
        ) : null}
      </span>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < Math.round(avg)
                ? "fill-amber-400 text-amber-400"
                : "text-slate-200"
            }`}
          />
        ))}
      </div>
      <span className="text-sm text-slate-800">{label}</span>
      {showVerified ? (
        <VerifiedSellerBadge
          sellerId={sellerId}
          reviews={reviews}
          authProvider={authProvider}
          profile={profile}
        />
      ) : null}
    </div>
  );
}
