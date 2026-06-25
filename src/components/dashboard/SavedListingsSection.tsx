"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { getListingCoverImage } from "@/lib/listing-image";
import { formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { listingPath } from "@/lib/seo";

export function SavedListingsSection() {
  const { listings, savedIds, toggleSave } = useVauto();
  const saved = listings.filter((l) => savedIds.has(l.id) && !l.banned);

  if (saved.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        <Heart className="h-4 w-4 text-[var(--vauto-red)]" />
        Išsaugoti skelbimai
      </h2>
      <div className="space-y-2">
        {saved.map((listing) => (
          <div
            key={listing.id}
            className="vauto-dashboard-card flex items-center gap-3 rounded-2xl p-3"
          >
            <Link
              href={listingPath(listing)}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl"
            >
              <Image
                src={getListingCoverImage(listing)}
                alt={listing.title}
                fill
                sizes="56px"
                className="object-cover"
              />
            </Link>
            <Link href={listingPath(listing)} className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {listing.title}
              </p>
              <p className="text-xs text-[var(--flux-teal)]">
                {formatPrice(listing.price, listing.priceLabel)}
              </p>
            </Link>
            <button
              type="button"
              onClick={() => toggleSave(listing.id)}
              className="rounded-full p-2 text-[var(--vauto-red)]"
              aria-label="Pašalinti iš mėgstamų"
            >
              <Heart className="h-4 w-4 fill-current" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
