"use client";

import Link from "next/link";
import { Heart, MapPin } from "lucide-react";
import { formatListingPlaceLine, formatPrice, isAiDiscoverListing } from "@/data/mockListings";
import { ListingImage } from "@/components/listing/ListingImage";
import { SellerRatingBadge } from "@/components/listing/SellerRatingBadge";
import { AiBadge } from "@/components/ui/AiBadge";
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

const INK = "var(--vauto-ink)";

export function MarketplaceListRow({
  listing,
  priceColor,
}: {
  listing: Listing;
  priceColor: string;
}) {
  const { savedIds, toggleSave, reviews } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);
  const resolvedPrice = priceColor || INK;

  return (
    <article
      className={`listing-card-row -mx-2 flex gap-3 rounded-xl border-b border-[var(--vauto-border-subtle)] px-2 py-3 last:border-0 ${feedTierCardClass(listing)}`}
    >
      <Link
        href={href}
        className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-[var(--vauto-surface-tint)]"
      >
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
          <h3 className="listing-card-title line-clamp-2 text-sm font-semibold text-[var(--vauto-ink)] hover:text-[var(--vauto-primary)]">
            {listing.title}
          </h3>
        </Link>
        <p className="mt-1 text-lg font-extrabold" style={{ color: resolvedPrice }}>
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
        <p className="listing-card-meta mt-1 flex items-center gap-1 text-xs text-[var(--vauto-subtle)]">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {formatListingPlaceLine(listing.location, listing.distanceKm)}
        </p>
        <div className="mt-1">
          <SellerRatingBadge
            sellerId={listing.sellerId}
            reviews={reviews}
            compact
            showVerified={false}
          />
        </div>
        <p className="listing-card-meta mt-0.5 text-[11px] text-[var(--vauto-subtle)]">
          {formatDate(listing.createdAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => toggleSave(listing.id)}
        className="shrink-0 self-start rounded-full p-2 hover:bg-[var(--vauto-surface-muted)]"
        aria-label={isSaved ? "Pašalinti iš mėgstamų" : "Išsaugoti"}
      >
        <Heart
          className={`h-5 w-5 ${isSaved ? "fill-[#ef4444] text-[#ef4444]" : "text-[var(--vauto-subtle)]"}`}
        />
      </button>
    </article>
  );
}

export function MarketplaceGridCard({
  listing,
  priceColor,
}: {
  listing: Listing;
  priceColor?: string;
}) {
  const { savedIds, toggleSave, reviews } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);
  const resolvedPrice = priceColor || INK;

  return (
    <article
      className={`listing-card group overflow-hidden rounded-2xl border border-[var(--vauto-border-subtle)] bg-white transition hover:border-[#C9D2E5] ${feedTierCardClass(listing)}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--vauto-surface-tint)]">
        <Link href={href} className="block h-full w-full">
          <ListingImage
            listing={listing}
            alt={listing.title}
            fill
            sizes="(max-width: 512px) 50vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        </Link>
        <div className="absolute left-2.5 top-2.5 z-[1] flex flex-col gap-1.5">
          <FeedTierBadge listing={listing} />
          {isAiDiscoverListing(listing) ? <AiBadge>AI atranda</AiBadge> : null}
        </div>
        <button
          type="button"
          onClick={() => toggleSave(listing.id)}
          className="absolute right-2 top-2 z-[1] rounded-full bg-white/95 p-1.5 shadow-sm backdrop-blur-sm"
          aria-label={isSaved ? "Pašalinti iš mėgstamų" : "Išsaugoti"}
        >
          <Heart
            size={16}
            className={isSaved ? "fill-[#ef4444] text-[#ef4444]" : "text-[var(--vauto-body)]"}
          />
        </button>
      </div>
      <Link href={href} className="block p-3.5">
        <h3 className="listing-card-title line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-[var(--vauto-ink)]">
          {listing.title}
        </h3>
        <div className="mt-1.5">
          <SellerRatingBadge
            sellerId={listing.sellerId}
            reviews={reviews}
            compact
            showVerified={false}
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <p className="text-base font-bold" style={{ color: resolvedPrice }}>
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          <p className="shrink-0 text-right text-xs text-[var(--vauto-subtle)]">
            {formatListingPlaceLine(listing.location, listing.distanceKm)}
          </p>
        </div>
      </Link>
    </article>
  );
}
