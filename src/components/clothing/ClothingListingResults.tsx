"use client";

import { getListingCoverImage } from "@/lib/listing-image";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { listingPath } from "@/lib/seo";
import type { ScoredListing } from "@/lib/types";

function VintedCard({ listing }: { listing: ScoredListing }) {
  const { savedIds, toggleSave } = useVauto();
  const ui = getPortalUi("vinted");
  const isSaved = savedIds.has(listing.id);
  const attrs = listing.attributes ?? {};
  const size = attrs.size ? String(attrs.size) : null;
  const brand = attrs.brand ? String(attrs.brand) : null;
  const condition = attrs.condition ? String(attrs.condition) : null;
  const chips = [size, brand, condition].filter(Boolean);

  return (
    <article className="overflow-hidden rounded-xl bg-[#fffdf9]">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#eceae6]">
        <Link href={listingPath(listing)} className="block h-full w-full">
          <Image
            src={getListingCoverImage(listing)}
            alt={listing.title}
            fill
            sizes="(max-width: 512px) 50vw"
            className="object-cover"
          />
        </Link>
        <button
          type="button"
          onClick={() => toggleSave(listing.id)}
          className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow-sm"
          aria-label={isSaved ? "Pašalinti" : "Išsaugoti"}
        >
          <Heart
            className="h-4 w-4"
            style={{ color: isSaved ? ui.accent : ui.textMuted }}
            fill={isSaved ? ui.accent : "none"}
          />
        </button>
      </div>
      <Link href={listingPath(listing)} className="mt-2 block px-0.5">
        {chips.length > 0 && (
          <p className="text-[10px] uppercase tracking-wide" style={{ color: ui.textMuted }}>
            {chips.join(" · ")}
          </p>
        )}
        <h3 className="mt-0.5 line-clamp-2 text-sm font-normal leading-snug" style={{ color: ui.text }}>
          {listing.title}
        </h3>
        <p className="mt-1 text-base font-semibold" style={{ color: ui.text }}>
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
        <p className="mt-0.5 text-[11px]" style={{ color: ui.textMuted }}>
          {listing.location}
        </p>
      </Link>
    </article>
  );
}

interface ClothingListingResultsProps {
  listings: ScoredListing[];
  title?: string;
}

export function ClothingListingResults({ listings, title }: ClothingListingResultsProps) {
  const ui = getPortalUi("vinted");
  const items = listings.filter((l) => l.category === "clothing");

  if (items.length === 0) {
    return (
      <p
        className="rounded-2xl border border-dashed p-6 text-center text-sm"
        style={{ borderColor: ui.border, color: ui.textMuted }}
      >
        Drabužių nerasta. Pabandykite kitą dydį ar prekės ženklą.
      </p>
    );
  }

  return (
    <div>
      {title && (
        <h3 className="mb-3 text-sm font-semibold" style={{ color: ui.text }}>
          {title}
        </h3>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((listing) => (
          <VintedCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}
