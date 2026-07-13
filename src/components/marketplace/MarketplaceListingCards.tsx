"use client";

import Link from "next/link";
import { Heart, MapPin } from "lucide-react";
import { formatDistanceBadge, formatPrice, isAiDiscoverListing } from "@/data/mockListings";
import { ListingImage } from "@/components/listing/ListingImage";
import { listingPath } from "@/lib/seo";
import { useVauto } from "@/context/VautoContext";
import type { Listing } from "@/lib/types";
import { FeedTierBadge, feedTierCardClass } from "@/components/marketplace/FeedTierBadge";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("lt-LT", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function MarketplaceListRow({
  listing,
  priceColor,
}: {
  listing: Listing;
  priceColor: string;
}) {
  const { savedIds, toggleSave } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);

  return (
    <article
      className={`listing-card-row flex gap-3 border-b py-3 last:border-0 ${feedTierCardClass(listing)} px-2 -mx-2 rounded-xl`}
    >
      <Link href={href} className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-[#e5e7eb]">
        <ListingImage
          listing={listing}
          alt={listing.title}
          fill
          sizes="112px"
          className="object-cover"
        />
        <div className="absolute left-1 top-1">
          <FeedTierBadge listing={listing} />
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={href}>
          <h3 className="listing-card-title line-clamp-2 text-sm font-semibold hover:text-[var(--vauto-primary)]">
            {listing.title}
          </h3>
        </Link>
        <p className="mt-1 text-lg font-extrabold" style={{ color: priceColor }}>
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
        <p className="listing-card-meta mt-1 flex items-center gap-1 text-xs">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {listing.location}
          <span>· {formatDistanceBadge(listing.distanceKm)}</span>
        </p>
        <p className="listing-card-meta mt-0.5 text-[11px]">{formatDate(listing.createdAt)}</p>
      </div>
      <button
        type="button"
        onClick={() => toggleSave(listing.id)}
        className="shrink-0 self-start rounded-full p-2 hover:bg-[var(--vauto-surface-muted)]"
        aria-label={isSaved ? "Pašalinti iš mėgstamų" : "Išsaugoti"}
      >
        <Heart
          className={`h-5 w-5 ${isSaved ? "fill-[#ef4444] text-[#ef4444]" : "text-[#94a3b8]"}`}
        />
      </button>
    </article>
  );
}

export function MarketplaceGridCard({
  listing,
}: {
  listing: Listing;
  priceColor?: string;
}) {
  const { savedIds, toggleSave } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);

  return (
    <article
      className={`listing-card group overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md ${feedTierCardClass(listing)}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100">
        <Link href={href} className="block h-full w-full">
          <ListingImage
            listing={listing}
            alt={listing.title}
            fill
            sizes="(max-width: 512px) 50vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </Link>
        <div className="absolute left-2 top-2">
          <FeedTierBadge listing={listing} />
        </div>
        {isAiDiscoverListing(listing) && (
          <span className="absolute bottom-2 left-2 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 px-2.5 py-1 text-[10px] font-bold text-orange-700 shadow-sm">
            ✨ AI ATRANDA
          </span>
        )}
        <button
          type="button"
          onClick={() => toggleSave(listing.id)}
          className="absolute right-2 top-2 rounded-full bg-white/95 p-1.5 shadow-sm backdrop-blur-sm"
          aria-label={isSaved ? "Pašalinti iš mėgstamų" : "Išsaugoti"}
        >
          <Heart
            size={16}
            className={isSaved ? "fill-[#ef4444] text-[#ef4444]" : "text-slate-600"}
          />
        </button>
      </div>
      <Link href={href} className="block p-3">
        <h3 className="listing-card-title line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-slate-900">
          {listing.title}
        </h3>
        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="text-base font-bold text-orange-600">
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          <p className="shrink-0 text-right text-xs text-slate-500">
            {listing.location}
          </p>
        </div>
      </Link>
    </article>
  );
}
