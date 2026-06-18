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
        className={`h-5 w-5 ${
          isSaved
            ? "fill-[var(--vauto-red)] text-[var(--vauto-red)]"
            : "text-white drop-shadow-md"
        }`}
      />
    </button>
  );
}

function ListingCard({ listing }: { listing: ScoredListing }) {
  const { savedIds } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);

  return (
    <article className="card-shadow w-[148px] shrink-0 overflow-hidden rounded-2xl bg-white sm:w-[160px]">
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
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
          className="absolute bottom-2 right-2 z-10"
        />
      </div>

      <Link href={href} className="block p-2.5">
        <h3 className="line-clamp-1 text-sm font-semibold text-[var(--vauto-text)]">
          {listing.title}
        </h3>
        <p className="mt-0.5 text-sm font-bold text-[var(--vauto-orange)]">
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
        <div className="mt-1.5">
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
    <article className="card-shadow overflow-hidden rounded-2xl bg-white">
      <div className="relative aspect-[16/10]">
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
          className="absolute right-2 top-2 z-10"
        />
      </div>
      <Link href={href} className="block p-3">
        <h3 className="line-clamp-1 text-sm font-semibold">{listing.title}</h3>
        <p className="text-sm font-bold text-[var(--vauto-orange)]">
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
  const { rankedListings, searchQuery, user } = useVauto();
  const featured = rankedListings.slice(0, 3);
  const more = rankedListings.slice(3);

  return (
    <section id="listing-results" aria-labelledby="listing-results-heading">
      <h2
        id="listing-results-heading"
        className="mb-3 text-sm text-[var(--vauto-text-muted)]"
      >
        {searchQuery ? (
          <>
            Rasta{" "}
            <span className="font-semibold text-[var(--vauto-text)]">
              {rankedListings.length}
            </span>{" "}
            atitikmenų
          </>
        ) : (
          <>
            Skelbimai šalia —{" "}
            <span className="font-semibold text-[var(--vauto-text)]">
              {user.city}
            </span>
          </>
        )}
      </h2>

      {rankedListings.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--vauto-text-muted)]">
          Nieko nerasta. Pabandykite kitą paiešką.
        </p>
      ) : (
        <>
          <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {featured.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>

          {more.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {more.map((listing) => (
                <WideListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
