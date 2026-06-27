"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Pencil, Sparkles } from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import { getListingCoverImage } from "@/lib/listing-image";
import { listingPath } from "@/lib/seo";
import { dashboardListingState, dashboardStateLabel } from "@/lib/listing-visibility";
import type { Listing } from "@/lib/types";

const ACCENT = "#09b1a8";

interface WardrobeCabinetGridProps {
  listings: Listing[];
  onEdit: (listing: Listing) => void;
  onMarkSold?: (listing: Listing) => void;
}

function WardrobeShelfCard({
  listing,
  onEdit,
  onMarkSold,
}: {
  listing: Listing;
  onEdit: () => void;
  onMarkSold?: () => void;
}) {
  const state = dashboardListingState(listing);
  const attrs = listing.attributes ?? {};
  const size = attrs.size ? String(attrs.size) : null;
  const brand = attrs.brand ? String(attrs.brand) : null;
  const chips = [size, brand].filter(Boolean);

  return (
    <article className="group overflow-hidden rounded-2xl border border-[#e8e4df] bg-[#fffdf9] shadow-sm transition hover:border-[#b8ebe8] hover:shadow-md">
      <div className="relative aspect-[3/4] overflow-hidden bg-[#eceae6]">
        <Link href={listingPath(listing)} className="block h-full w-full">
          <Image
            src={getListingCoverImage(listing)}
            alt={listing.title}
            fill
            sizes="(max-width: 512px) 50vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </Link>
        <span
          className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-light text-white backdrop-blur-sm"
          style={{ backgroundColor: `${ACCENT}dd` }}
        >
          {state === "sold" ? "Parduota" : dashboardStateLabel(state)}
        </span>
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full bg-white/95 p-1.5 text-[#374151] shadow-sm"
            aria-label="Redaguoti"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onMarkSold && state !== "sold" && (
            <button
              type="button"
              onClick={onMarkSold}
              className="rounded-full bg-white/95 p-1.5 text-[#09b1a8] shadow-sm"
              aria-label="Pažymėti parduota"
            >
              <Heart className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <Link href={listingPath(listing)} className="block px-3 py-3">
        {chips.length > 0 && (
          <p className="text-[10px] uppercase tracking-wide text-[#9ca3af]">
            {chips.join(" · ")}
          </p>
        )}
        <h3 className="mt-0.5 line-clamp-2 text-sm font-light leading-snug text-[#374151]">
          {listing.title}
        </h3>
        <p className="mt-1 text-base font-medium text-[#374151]">
          {formatPrice(listing.price, listing.priceLabel)}
        </p>
      </Link>
    </article>
  );
}

export function WardrobeCabinetGrid({
  listings,
  onEdit,
  onMarkSold,
}: WardrobeCabinetGridProps) {
  const clothing = listings.filter((l) => l.category === "clothing");

  if (clothing.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[#b8ebe8] bg-[#fffdf9] px-6 py-14 text-center">
        <Sparkles className="mx-auto mb-3 h-8 w-8 text-[#09b1a8]" />
        <p className="text-sm font-light text-[#374151]">
          Tavo spinta dar tuščia — įkelk pirmą prekę ir aš padėsiu viską sutvarkyti.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {clothing.map((listing) => (
        <WardrobeShelfCard
          key={listing.id}
          listing={listing}
          onEdit={() => onEdit(listing)}
          onMarkSold={onMarkSold ? () => onMarkSold(listing) : undefined}
        />
      ))}
    </div>
  );
}
