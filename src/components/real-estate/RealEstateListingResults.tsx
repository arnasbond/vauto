"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { formatDistanceBadge, formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { formatRealEstateArea, realEstateSummaryLabel } from "@/lib/real-estate-catalog";
import { listingPath } from "@/lib/seo";
import type { ScoredListing } from "@/lib/types";

function RealEstateRow({ listing }: { listing: ScoredListing }) {
  const { savedIds, toggleSave } = useVauto();
  const ui = getPortalUi("aruodas");
  const isSaved = savedIds.has(listing.id);
  const attrs = listing.attributes ?? {};
  const rooms = attrs.rooms ? `${attrs.rooms} kamb.` : null;
  const area = attrs.area ? formatRealEstateArea(attrs.area) : null;
  const summary = realEstateSummaryLabel(attrs);
  const meta = [rooms, area, summary !== area ? summary : ""].filter(Boolean).join(" · ");

  return (
    <article
      className="flex gap-3 border-b py-3 last:border-0"
      style={{ borderColor: ui.border }}
    >
      <Link
        href={listingPath(listing)}
        className="relative h-[80px] w-[112px] shrink-0 overflow-hidden rounded-md bg-[#eee]"
      >
        <Image src={listing.image} alt={listing.title} fill sizes="112px" className="object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={listingPath(listing)}>
          <h3 className="text-sm font-bold leading-snug hover:underline" style={{ color: ui.link }}>
            {listing.title}
          </h3>
          {meta && (
            <p className="mt-0.5 text-xs" style={{ color: ui.textMuted }}>
              {meta}
            </p>
          )}
          <p className="mt-1 text-lg font-extrabold" style={{ color: ui.price }}>
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: ui.textMuted }}>
            {listing.location} · {formatDistanceBadge(listing.distanceKm)}
          </p>
        </Link>
      </div>
      <button
        type="button"
        onClick={() => toggleSave(listing.id)}
        className="shrink-0 self-start rounded-full p-2"
        aria-label={isSaved ? "Pašalinti" : "Išsaugoti"}
      >
        <Heart
          className="h-5 w-5"
          style={{ color: isSaved ? ui.cta : ui.textMuted }}
          fill={isSaved ? ui.cta : "none"}
        />
      </button>
    </article>
  );
}

interface RealEstateListingResultsProps {
  listings: ScoredListing[];
  title?: string;
}

export function RealEstateListingResults({ listings, title }: RealEstateListingResultsProps) {
  const ui = getPortalUi("aruodas");
  const items = listings.filter((l) => l.category === "real_estate");

  if (items.length === 0) {
    return (
      <p
        className="rounded-lg border border-dashed p-6 text-center text-sm"
        style={{ borderColor: ui.border, color: ui.textMuted }}
      >
        NT skelbimų nerasta. Pabandykite kitą tipą ar miestą.
      </p>
    );
  }

  return (
    <div className="rounded-lg border bg-white px-3 shadow-sm" style={{ borderColor: ui.border }}>
      {title && (
        <h3 className="border-b py-3 text-sm font-semibold" style={{ borderColor: ui.border, color: ui.text }}>
          {title}
        </h3>
      )}
      {items.map((listing) => (
        <RealEstateRow key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
