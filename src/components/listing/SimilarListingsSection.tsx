"use client";

import { ListingCard } from "@/components/marketplace/ListingCard";
import type { Listing } from "@/lib/types";

export function SimilarListingsSection({
  listings,
  title = "Panašūs skelbimai",
}: {
  listings: Listing[];
  title?: string;
}) {
  if (!listings.length) return null;

  return (
    <section
      className="mt-8 border-t border-[var(--ds-border-subtle,var(--vauto-border-subtle))] pt-6"
      aria-labelledby="similar-listings-heading"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2
          id="similar-listings-heading"
          className="font-[family-name:var(--font-outfit)] text-base font-semibold text-[var(--ds-text-primary,var(--vauto-ink))] sm:text-lg"
        >
          {title}
        </h2>
        <span className="text-xs text-[var(--ds-text-muted,var(--vauto-subtle))]">
          Taip pat gali patikti
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {listings.slice(0, 8).map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            layout="grid"
            showHeart={false}
          />
        ))}
      </div>
    </section>
  );
}
