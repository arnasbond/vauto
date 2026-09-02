"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { ListingCard } from "@/components/marketplace/ListingCard";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/cn";

interface HomeTrendingStripProps {
  listings: Listing[];
  onSeeAll?: () => void;
  className?: string;
}

const STRIP_SIZE = 6;

/**
 * Real-marketplace-context strip shown directly under the category row on
 * the homepage first fold. Uses only already-loaded catalog listings (no
 * invented data, no new backend calls) so the transition from "search +
 * categories" into "content" reads as one continuous marketplace, matching
 * the MASTER reference's information density instead of ending in an empty
 * band before the next section.
 */
export function HomeTrendingStrip({
  listings,
  onSeeAll,
  className,
}: HomeTrendingStripProps) {
  const featured = useMemo(() => listings.slice(0, STRIP_SIZE), [listings]);

  if (featured.length === 0) return null;

  return (
    <div
      className={cn("mt-5 border-t border-[var(--ds-border-subtle)] pt-5", className)}
      data-home-trending-strip
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold tracking-tight text-[var(--ds-text-primary)]">
          Naujausi skelbimai rinkoje
        </h2>
        {onSeeAll ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--ds-brand)] transition hover:opacity-80"
          >
            Žiūrėti visus
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-3 lg:overflow-visible lg:px-0">
        {featured.map((listing, index) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            variant="compact"
            className="w-[150px] shrink-0 snap-start sm:w-[168px] lg:w-full"
            priority={index === 0}
          />
        ))}
      </div>
    </div>
  );
}
