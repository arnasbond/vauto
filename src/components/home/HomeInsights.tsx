"use client";

import { Flame, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { listingPath } from "@/lib/seo";

export function PopularTodaySection() {
  const { popularListingIds, listings, searchQuery } = useVauto();

  if (searchQuery || popularListingIds.length === 0) return null;

  const popular = popularListingIds
    .map((id) => listings.find((l) => l.id === id))
    .filter(Boolean);

  if (!popular.length) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-white">
        <Flame className="h-4 w-4 text-[var(--flux-coral)]" />
        Populiaru šiandien — Panevėžys
      </h2>
      <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4">
        {popular.map((listing) => {
          if (!listing) return null;
          return (
            <Link
              key={listing.id}
              href={listingPath(listing)}
              className="vauto-glass-card w-[140px] shrink-0 overflow-hidden rounded-2xl p-2"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl">
                <Image
                  src={listing.image}
                  alt={listing.title}
                  fill
                  sizes="140px"
                  className="object-cover"
                />
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-semibold text-white">
                {listing.title}
              </p>
              <p className="vauto-flux-price text-sm">
                {formatPrice(listing.price, listing.priceLabel)}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function SocialProofStrip() {
  const { recentSoldStories, searchQuery } = useVauto();

  if (searchQuery || recentSoldStories.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-[var(--flux-teal)]/20 bg-[var(--flux-teal)]/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-[var(--flux-teal)]" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--flux-teal)]">
          Parduota per Vauto
        </h2>
      </div>
      <ul className="space-y-1.5">
        {recentSoldStories.map((story) => (
          <li key={story.id} className="text-sm text-[var(--vauto-text-muted)]">
            <span className="text-white">{story.title}</span>
            {" · "}
            {story.location} — {story.timeAgo}
          </li>
        ))}
      </ul>
    </section>
  );
}
