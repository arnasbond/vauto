"use client";

import { BadgeCheck } from "lucide-react";
import { isVerifiedTrustedSeller } from "@/lib/reviews";
import type { AuthProvider, SellerReview, UserProfile } from "@/lib/types";

interface VerifiedSellerBadgeProps {
  sellerId: string;
  reviews: SellerReview[];
  authProvider?: AuthProvider | string | null;
  profile?: Pick<UserProfile, "authProvider" | "phone" | "email"> | null;
  className?: string;
}

export function VerifiedSellerBadge({
  sellerId,
  reviews,
  authProvider,
  profile,
  className = "",
}: VerifiedSellerBadgeProps) {
  if (!isVerifiedTrustedSeller(sellerId, reviews, authProvider, profile)) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200 ${className}`}
      title="Patvirtinta paskyra ir 5+ teigiami atsiliepimai"
    >
      <BadgeCheck className="h-3 w-3" aria-hidden />
      Patikrintas pardavėjas
    </span>
  );
}
