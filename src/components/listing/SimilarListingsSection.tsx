"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import { ListingImage } from "@/components/listing/ListingImage";
import { listingPath } from "@/lib/seo";
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
    <section className="mt-8 border-t border-[var(--vauto-border-subtle)] pt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-outfit)] text-base font-semibold text-[var(--vauto-ink)]">
          {title}
        </h2>
        <span className="text-xs text-[var(--vauto-subtle)]">Taip pat gali patikti</span>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {listings.map((listing) => {
          const href = listingPath(listing);
          return (
            <Link
              key={listing.id}
              href={href}
              className="group w-[9.5rem] shrink-0 snap-start overflow-hidden rounded-2xl border border-[var(--vauto-border-subtle)] bg-white transition hover:border-[#C9D2E5] sm:w-[11rem]"
            >
              <div className="relative aspect-[4/3] bg-[var(--vauto-surface-tint)]">
                <ListingImage
                  listing={listing}
                  alt={listing.title}
                  fill
                  sizes="176px"
                  className="object-cover transition group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 min-h-[2.25rem] text-xs font-semibold leading-snug text-[var(--vauto-ink)]">
                  {listing.title}
                </p>
                <p className="mt-1 text-sm font-extrabold text-[var(--vauto-ink)]">
                  {formatPrice(listing.price, listing.priceLabel)}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-[var(--vauto-subtle)]">
                  {listing.location}
                </p>
              </div>
            </Link>
          );
        })}
        <div className="flex w-8 shrink-0 items-center justify-center text-[var(--vauto-subtle)]">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </section>
  );
}
