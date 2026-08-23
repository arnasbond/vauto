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
          : "bg-[var(--ds-brand-soft)] text-[var(--ds-brand)] ring-1 ring-[var(--ds-brand)]/25"
      }`}
    >
      {label}
    </span>
  );
}

export function feedTierCardClass(listing: import("@/lib/types").Listing): string {
  const tier = resolveFeedVisibilityTier(listing);
  if (tier === "top") {
    return "listing-card listing-card-tier-top shadow-md ring-1 ring-amber-200/70";
  }
  if (tier === "plus") {
    return "listing-card listing-card-tier-plus ring-1 ring-[var(--ds-brand)]/15";
  }
  return "listing-card shadow-sm";
}
