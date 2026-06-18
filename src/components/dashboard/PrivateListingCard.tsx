"use client";

import Image from "next/image";
import Link from "next/link";
import { CheckCircle, Pencil, Trash2 } from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import { isListingActive } from "@/lib/listing-expiry";
import type { Listing, ListingStatus } from "@/lib/types";

interface PrivateListingCardProps {
  listing: Listing;
  onEdit: () => void;
  onDelete: () => void;
  onMarkSold: () => void;
}

function statusLabel(listing: Listing): { text: string; className: string } {
  if (listing.status === "sold")
    return { text: "Parduota", className: "bg-slate-500/30 text-slate-300" };
  if (!isListingActive(listing))
    return { text: "Pasibaigęs", className: "bg-red-500/20 text-red-300" };
  return { text: "Aktyvus", className: "bg-emerald-500/20 text-emerald-300" };
}

export function PrivateListingCard({
  listing,
  onEdit,
  onDelete,
  onMarkSold,
}: PrivateListingCardProps) {
  const status = statusLabel(listing);

  return (
    <div className="vauto-dashboard-card rounded-2xl p-3">
      <div className="flex gap-3">
        <Link
          href={`/listing/?id=${listing.id}`}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl"
        >
          <Image
            src={listing.image}
            alt={listing.title}
            fill
            sizes="64px"
            className="object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold text-sm text-white">
              {listing.title}
            </p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}
            >
              {status.text}
            </span>
          </div>
          <p className="text-sm font-bold text-[var(--vauto-orange)]">
            {formatPrice(listing.price, listing.priceLabel)}
          </p>
          <p className="text-xs text-slate-500">{listing.location}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/10 py-2 text-xs font-medium text-white"
        >
          <Pencil className="h-3 w-3" />
          Redaguoti
        </button>
        {listing.status !== "sold" && (
          <button
            type="button"
            onClick={onMarkSold}
            className="flex items-center justify-center gap-1 rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-300"
          >
            <CheckCircle className="h-3 w-3" />
            Parduota
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export type { ListingStatus };
