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
    <section className="mt-8 border-t border-slate-100 pt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-400">Taip pat gali patikti</span>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {listings.map((listing) => {
          const href = listingPath(listing);
          return (
            <Link
              key={listing.id}
              href={href}
              className="group w-[9.5rem] shrink-0 snap-start overflow-hidden rounded-2xl border border-[#dde5ef] bg-white shadow-sm transition hover:border-[#1167b1]/40 hover:shadow-md sm:w-[11rem]"
            >
              <div className="relative aspect-[4/3] bg-slate-100">
                <ListingImage
                  listing={listing}
                  alt={listing.title}
                  fill
                  sizes="176px"
                  className="object-cover transition group-hover:scale-[1.02]"
                />
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 min-h-[2.25rem] text-xs font-semibold leading-snug text-slate-900">
                  {listing.title}
                </p>
                <p className="mt-1 text-sm font-extrabold text-[#1167b1]">
                  {formatPrice(listing.price, listing.priceLabel)}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">
                  {listing.location}
                </p>
              </div>
            </Link>
          );
        })}
        <div className="flex w-8 shrink-0 items-center justify-center text-slate-300">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </section>
  );
}
