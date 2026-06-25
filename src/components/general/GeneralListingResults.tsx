"use client";

import { getListingCoverImage } from "@/lib/listing-image";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { formatDistanceBadge, formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { listingPath } from "@/lib/seo";
import type { ScoredListing } from "@/lib/types";

function SkelbiuRow({ listing }: { listing: ScoredListing }) {
  const { savedIds, toggleSave } = useVauto();
  const ui = getPortalUi("skelbiu");
  const isSaved = savedIds.has(listing.id);
  const categoryPath = listing.attributes?.skelbiuCategory
    ? String(listing.attributes.skelbiuCategory)
    : null;

  return (
    <article
      className="flex gap-3 border-b py-3 last:border-0"
      style={{ borderColor: ui.border }}
    >
      <Link
        href={listingPath(listing)}
        className="relative h-[72px] w-[96px] shrink-0 overflow-hidden rounded bg-[#eceff1]"
      >
        <Image src={getListingCoverImage(listing)} alt={listing.title} fill sizes="96px" className="object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={listingPath(listing)}>
          {categoryPath && (
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: ui.link }}>
              {categoryPath.split("›").slice(-2).join(" › ")}
            </p>
          )}
          <h3 className="text-sm font-semibold leading-snug hover:underline" style={{ color: ui.text }}>
            {listing.title}
          </h3>
          <p className="mt-1 text-base font-bold" style={{ color: ui.price }}>
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
        className="shrink-0 self-start p-2"
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

interface GeneralListingResultsProps {
  listings: ScoredListing[];
  title?: string;
}

export function GeneralListingResults({ listings, title }: GeneralListingResultsProps) {
  const ui = getPortalUi("skelbiu");
  const items = listings.filter((l) =>
    ["electronics", "home", "other"].includes(l.category)
  );

  if (items.length === 0) {
    return (
      <p
        className="rounded border border-dashed p-6 text-center text-sm"
        style={{ borderColor: ui.border, color: ui.textMuted }}
      >
        Skelbimų nerasta. Pabandykite kitą kategoriją ar miestą.
      </p>
    );
  }

  return (
    <div className="rounded border bg-white px-3 shadow-sm" style={{ borderColor: ui.border }}>
      {title && (
        <h3 className="border-b py-3 text-sm font-semibold" style={{ borderColor: ui.border, color: ui.text }}>
          {title}
        </h3>
      )}
      {items.map((listing) => (
        <SkelbiuRow key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
