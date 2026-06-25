"use client";

import Image from "next/image";
import Link from "next/link";
import { CheckCircle, Eye, MessageCircle, Pencil, Phone, RefreshCw, Trash2 } from "lucide-react";
import { getListingCoverImage } from "@/lib/listing-image";
import { formatPrice } from "@/data/mockListings";
import { formatExpiryLabel, isListingActive } from "@/lib/listing-expiry";
import { getListingMetrics } from "@/lib/listing-analytics";
import { ShareListingButton } from "@/components/social/ShareListingButton";
import { listingPath } from "@/lib/seo";
import type { Listing, ListingStatus } from "@/lib/types";

interface PrivateListingCardProps {
  listing: Listing;
  onEdit: () => void;
  onDelete: () => void;
  onMarkSold: () => void;
  onRenew: () => void;
}

function statusLabel(listing: Listing): { text: string; className: string } {
  if (listing.status === "sold")
    return { text: "Parduota", className: "bg-slate-500/30 text-slate-600" };
  if (!isListingActive(listing))
    return { text: "Pasibaigęs", className: "bg-red-100 text-red-800" };
  return { text: "Aktyvus", className: "bg-emerald-100 text-emerald-800" };
}

export function PrivateListingCard({
  listing,
  onEdit,
  onDelete,
  onMarkSold,
  onRenew,
}: PrivateListingCardProps) {
  const status = statusLabel(listing);
  const expiryLabel = formatExpiryLabel(listing);
  const expired = listing.status !== "sold" && !isListingActive(listing);
  const metrics = getListingMetrics(listing);

  return (
    <div className="vauto-dashboard-card rounded-2xl p-3">
      <div className="flex gap-3">
        <Link
          href={listingPath(listing)}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl"
        >
          <Image
            src={getListingCoverImage(listing)}
            alt={listing.title}
            fill
            sizes="64px"
            className="object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold text-sm text-slate-900">
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
          {expiryLabel && listing.status !== "sold" && (
            <p
              className={`mt-0.5 text-[10px] font-medium ${
                expired ? "text-red-700" : "text-amber-700"
              }`}
            >
              {expiryLabel}
            </p>
          )}
        </div>
      </div>
      {listing.status !== "sold" && (
        <div className="mt-2 flex gap-3 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-0.5">
            <Eye className="h-3 w-3" /> {metrics.views}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Phone className="h-3 w-3" /> {metrics.callClicks}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <MessageCircle className="h-3 w-3" /> {metrics.chatStarts}
          </span>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {expired && (
          <button
            type="button"
            onClick={onRenew}
            className="flex w-full items-center justify-center gap-1 rounded-xl bg-[var(--vauto-teal)] py-2 text-xs font-semibold text-white"
          >
            <RefreshCw className="h-3 w-3" />
            Pratęsti 90 d.
          </button>
        )}
        {listing.status !== "sold" && (
          <ShareListingButton listing={listing} className="flex-1" />
        )}
        <button
          type="button"
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-100 py-2 text-xs font-medium text-slate-900"
        >
          <Pencil className="h-3 w-3" />
          Redaguoti
        </button>
        {listing.status !== "sold" && (
          <button
            type="button"
            onClick={onMarkSold}
            className="flex items-center justify-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
          >
            <CheckCircle className="h-3 w-3" />
            Parduota
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export type { ListingStatus };
