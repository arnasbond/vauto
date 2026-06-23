"use client";

import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Heart } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { formatServiceDisplayTitle, formatServiceMetaLine } from "@/lib/service-catalog";
import { listingPath } from "@/lib/seo";
import type { ScoredListing } from "@/lib/types";

function ServiceRow({ listing }: { listing: ScoredListing }) {
  const { savedIds, toggleSave } = useVauto();
  const ui = getPortalUi("paslaugos");
  const isSaved = savedIds.has(listing.id);

  return (
    <article
      className="flex gap-3 rounded-xl border bg-white p-3 shadow-sm"
      style={{ borderColor: ui.border }}
    >
      <Link
        href={listingPath(listing)}
        className="relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-full bg-[#e6fffb]"
      >
        <Image src={listing.image} alt={listing.title} fill sizes="64px" className="object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={listingPath(listing)}>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold leading-snug hover:underline" style={{ color: ui.text }}>
              {formatServiceDisplayTitle(listing)}
            </h3>
            {listing.providerVerified && (
              <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: ui.accent }} aria-label="Patvirtintas" />
            )}
          </div>
          <p className="mt-0.5 text-xs" style={{ color: ui.textMuted }}>
            {formatServiceMetaLine(listing)}
          </p>
          {listing.description && (
            <p className="mt-1 line-clamp-2 text-xs" style={{ color: ui.textMuted }}>
              {listing.description}
            </p>
          )}
        </Link>
      </div>
      <button
        type="button"
        onClick={() => toggleSave(listing.id)}
        className="shrink-0 self-start p-1"
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

interface ServiceListingResultsProps {
  listings: ScoredListing[];
  title?: string;
}

export function ServiceListingResults({ listings, title }: ServiceListingResultsProps) {
  const ui = getPortalUi("paslaugos");
  const items = listings.filter((l) => l.category === "services");

  if (items.length === 0) {
    return (
      <p
        className="rounded-xl border border-dashed p-6 text-center text-sm"
        style={{ borderColor: ui.border, color: ui.textMuted }}
      >
        Paslaugų teikėjų nerasta. Pabandykite kitą specialybę ar miestą.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="mb-2 text-sm font-semibold" style={{ color: ui.text }}>
          {title}
        </h3>
      )}
      {items.map((listing) => (
        <ServiceRow key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
