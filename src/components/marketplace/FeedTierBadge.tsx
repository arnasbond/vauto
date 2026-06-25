"use client";

import {
  feedTierBadgeLabel,
  resolveFeedVisibilityTier,
} from "@/lib/feed-tier";

export function FeedTierBadge({
  listing,
  className = "",
}: {
  listing: { visibilityTier?: string; promoted?: boolean };
  className?: string;
}) {
  const tier = resolveFeedVisibilityTier(listing as import("@/lib/types").Listing);
  const label = feedTierBadgeLabel(tier);
  if (!label) return null;

  const isTop = tier === "top";

  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm ${className} ${
        isTop
          ? "bg-amber-400 text-amber-950 ring-1 ring-amber-500/60"
          : "bg-sky-100 text-sky-800 ring-1 ring-sky-200"
      }`}
    >
      {label}
    </span>
  );
}

export function feedTierCardClass(listing: import("@/lib/types").Listing): string {
  const tier = resolveFeedVisibilityTier(listing);
  if (tier === "top") {
    return "border-amber-300/80 bg-gradient-to-b from-amber-50/90 to-white shadow-md ring-1 ring-amber-200/70";
  }
  if (tier === "plus") {
    return "border-sky-200/80 bg-gradient-to-b from-sky-50/50 to-white ring-1 ring-sky-100";
  }
  return "border-[#dde5ef] bg-white shadow-sm";
}
