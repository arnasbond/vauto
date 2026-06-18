"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, MapPin, Play } from "lucide-react";
import { formatDistanceBadge, formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { listingPath } from "@/lib/seo";
import { TrustBadges } from "@/components/trust/TrustBadges";
import type { ScoredListing } from "@/lib/types";

function SaveButton({
  listingId,
  isSaved,
  className,
}: {
  listingId: string;
  isSaved: boolean;
  className?: string;
}) {
  const { toggleSave } = useVauto();

  return (
    <button
      type="button"
      onClick={() => toggleSave(listingId)}
      className={className}
      aria-label={isSaved ? "Pašalinti iš mėgstamų" : "Išsaugoti"}
      aria-pressed={isSaved}
    >
      <Heart
        size={14}
        className={
          isSaved
            ? "fill-[var(--vauto-red)] text-[var(--vauto-red)]"
            : "text-white"
        }
      />
    </button>
  );
}

function ListingCard({ listing }: { listing: ScoredListing }) {
  const { savedIds } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);

  return (
    <article className="vauto-glass-card w-[156px] shrink-0 overflow-hidden rounded-[22px] p-2.5 transition-all hover:border-white/12 sm:w-[160px]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black/20">
        <Link href={href} className="block h-full w-full">
          <Image
            src={listing.image}
            alt={listing.title}
            fill
            sizes="160px"
            className="object-cover"
          />
          {listing.hasVideo && (
            <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white">
              <Play className="h-3.5 w-3.5 fill-white" />
            </span>
          )}
          <span className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
            <MapPin className="h-2.5 w-2.5" />
            {formatDistanceBadge(listing.distanceKm)}
          </span>
        </Link>
        <SaveButton
          listingId={listing.id}
          isSaved={isSaved}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
        />
      </div>

      <Link href={href} className="mt-2 block">
        <h3 className="truncate text-sm font-semibold text-white">
          {listing.title}
        </h3>
        <p className="vauto-flux-price text-base">
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
        <div className="mt-1">
          <TrustBadges listing={listing} />
        </div>
        <p className="mt-1 truncate text-[10px] text-[var(--vauto-text-muted)]">
          {listing.location}
        </p>
      </Link>
    </article>
  );
}

function WideListingCard({ listing }: { listing: ScoredListing }) {
  const { savedIds } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);

  return (
    <article className="vauto-glass-card overflow-hidden rounded-[22px] p-2.5 transition-all hover:border-white/12">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-black/20">
        <Link href={href} className="block h-full w-full">
          <Image
            src={listing.image}
            alt={listing.title}
            fill
            sizes="(max-width: 512px) 50vw"
            className="object-cover"
          />
          <span className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-medium text-white">
            <MapPin className="h-2.5 w-2.5" />
            {formatDistanceBadge(listing.distanceKm)}
          </span>
        </Link>
        <SaveButton
          listingId={listing.id}
          isSaved={isSaved}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
        />
      </div>
      <Link href={href} className="mt-2 block">
        <h3 className="line-clamp-1 text-sm font-semibold text-white">
          {listing.title}
        </h3>
        <p className="vauto-flux-price text-sm">
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
        <div className="mt-1">
          <TrustBadges listing={listing} />
        </div>
        <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
          {listing.location}
        </p>
      </Link>
    </article>
  );
}

export function ListingGrid() {
  const { rankedListings, searchQuery } = useVauto();
  const carouselListings = rankedListings.slice(0, 3);
  const gridListings = rankedListings.slice(3);

  return (
    <section id="listing-results" aria-labelledby="listing-results-heading" className="py-2">
      <h2
        id="listing-results-heading"
        className="font-display mb-4 text-base font-bold tracking-tight text-white"
      >
        {searchQuery ? (
          <>Rasta skelbimų: {rankedListings.length}</>
        ) : (
          <>Šalia tavęs</>
        )}
      </h2>

      {rankedListings.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--vauto-text-muted)]">
          Nieko nerasta. Pabandykite kitą paiešką.
        </p>
      ) : (
        <>
          <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
            {carouselListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>

          {gridListings.length > 0 && (
            <div className="mt-2">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                Kiti pasiūlymai
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {gridListings.map((listing) => (
                  <WideListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
