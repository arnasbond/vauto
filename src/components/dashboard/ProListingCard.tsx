"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, TrendingUp, RefreshCw } from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import { mockListingMetrics } from "@/lib/dashboard-mock";
import { getPromoteSuggestion } from "@/lib/smart-promote";
import { listingPath } from "@/lib/seo";
import type { Listing } from "@/lib/types";
import { TrustBadges } from "@/components/trust/TrustBadges";
import { formatExpiryLabel, isListingActive } from "@/lib/listing-expiry";
import { SmartPromoteModal } from "./SmartPromoteModal";

interface ProListingCardProps {
  listing: Listing;
  walletBalance: number;
  onEdit: () => void;
  onDelete: () => void;
  onPromote: (listingId: string, cost: number) => boolean;
  onRenew: () => void;
}

export function ProListingCard({
  listing,
  walletBalance,
  onEdit,
  onDelete,
  onPromote,
  onRenew,
}: ProListingCardProps) {
  const [promoteOpen, setPromoteOpen] = useState(false);
  const metrics = mockListingMetrics(listing);
  const suggestion = getPromoteSuggestion(listing);
  const isSold = listing.status === "sold";
  const expiryLabel = formatExpiryLabel(listing);
  const expired = !isSold && !isListingActive(listing);

  return (
    <>
      <div className="vauto-dashboard-card rounded-2xl p-4">
        <div className="flex gap-3">
          <Link
            href={listingPath(listing)}
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl"
          >
            <Image
              src={listing.image}
              alt={listing.title}
              fill
              sizes="80px"
              className="object-cover"
            />
            {listing.promoted && (
              <span className="absolute left-1 top-1 rounded-md bg-[var(--vauto-orange)] px-1.5 py-0.5 text-[8px] font-bold text-white">
                BOOST
              </span>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={listingPath(listing)} className="block">
              <p className="truncate font-semibold text-white">{listing.title}</p>
            </Link>
            <p className="text-lg font-bold text-[var(--vauto-orange)]">
              {formatPrice(listing.price, listing.priceLabel)}
            </p>
            <TrustBadges listing={listing} size="sm" />
            {expiryLabel && (
              <p
                className={`mt-0.5 text-[10px] font-medium ${
                  expired ? "text-red-300" : "text-amber-300"
                }`}
              >
                {expiryLabel}
              </p>
            )}
            <div className="mt-1 flex gap-3 text-[10px] text-slate-400">
              <span>{metrics.views} perž.</span>
              <span>{metrics.clicks} pas.</span>
              <span className="flex items-center gap-0.5 text-[var(--vauto-teal)]">
                <TrendingUp className="h-3 w-3" />
                {metrics.interestScore}%
              </span>
            </div>
          </div>
        </div>

        {!isSold && !listing.promoted && (
          <button
            type="button"
            onClick={() => setPromoteOpen(true)}
            className="mt-3 flex w-full items-start gap-2 rounded-xl border border-[var(--vauto-teal)]/30 bg-[var(--vauto-teal)]/10 p-3 text-left transition hover:bg-[var(--vauto-teal)]/15"
          >
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vauto-teal)]" />
            <div>
              <p className="text-xs font-semibold text-[var(--vauto-teal)]">
                Smart Promote
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-300">
                {suggestion.message} · {suggestion.cost.toFixed(2)}€
              </p>
            </div>
          </button>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
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
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-xl bg-white/10 py-2 text-xs text-white"
          >
            Redaguoti
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl bg-red-500/15 px-4 py-2 text-xs text-red-300"
          >
            Ištrinti
          </button>
        </div>
      </div>

      <SmartPromoteModal
        open={promoteOpen}
        listing={listing}
        suggestion={suggestion}
        walletBalance={walletBalance}
        onClose={() => setPromoteOpen(false)}
        onConfirm={() => {
          const ok = onPromote(listing.id, suggestion.cost);
          if (ok) setPromoteOpen(false);
          return ok;
        }}
      />
    </>
  );
}
