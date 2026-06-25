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
import {
  isVehiclePartsListing,
  queryWantsVehicleParts,
} from "@/lib/vehicle-parts";

function formatMileage(value: string | string[] | number): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/\bkm\b/i.test(s)) return s;
  return `${s} km`;
}

function VehicleRow({ listing }: { listing: ScoredListing }) {
  const { savedIds, toggleSave } = useVauto();
  const ui = getPortalUi("autoplius");
  const isSaved = savedIds.has(listing.id);
  const attrs = listing.attributes ?? {};
  const specs = [
    attrs.year,
    attrs.fuelType,
    attrs.mileage && formatMileage(attrs.mileage),
    attrs.gearbox,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className="flex gap-3 border-b py-3 last:border-0"
      style={{ borderColor: ui.border }}
    >
      <Link href={listingPath(listing)} className="relative h-[72px] w-[96px] shrink-0 overflow-hidden rounded-md bg-[#e5e7eb]">
        <Image src={getListingCoverImage(listing)} alt={listing.title} fill sizes="96px" className="object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={listingPath(listing)}>
          <h3 className="text-sm font-bold leading-snug hover:underline" style={{ color: ui.link }}>
            {listing.title}
          </h3>
          {specs && (
            <p className="mt-0.5 text-xs" style={{ color: ui.textMuted }}>
              {specs}
            </p>
          )}
          <p className="mt-1 text-base font-extrabold" style={{ color: ui.price }}>
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

interface VehicleListingResultsProps {
  listings: ScoredListing[];
  title?: string;
}

export function VehicleListingResults({ listings, title }: VehicleListingResultsProps) {
  const ui = getPortalUi("autoplius");
  const { searchQuery } = useVauto();
  const showParts = queryWantsVehicleParts(searchQuery);
  const vehicles = listings
    .filter((l) => l.category === "vehicles")
    .filter((l) => showParts || !isVehiclePartsListing(l));

  if (vehicles.length === 0) {
    return (
      <p
        className="rounded-lg border border-dashed p-6 text-center text-sm"
        style={{ borderColor: ui.border, color: ui.textMuted }}
      >
        Automobilių nerasta. Pabandykite kitą markę ar miestą.
      </p>
    );
  }

  return (
    <div className="rounded-lg border bg-white px-3 shadow-sm" style={{ borderColor: ui.border }}>
      {title && (
        <h3 className="border-b py-3 text-sm font-bold" style={{ borderColor: ui.border, color: ui.text }}>
          {title}
        </h3>
      )}
      {vehicles.map((listing) => (
        <VehicleRow key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
