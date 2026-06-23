"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, TrendingUp, RefreshCw } from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import { getListingMetrics } from "@/lib/listing-analytics";
import { getPromoteSuggestion } from "@/lib/smart-promote";
import { categoryToTheme } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";
import { listingPath } from "@/lib/seo";
import type { Listing } from "@/lib/types";
import { TrustBadges } from "@/components/trust/TrustBadges";
import { formatExpiryLabel, isListingActive } from "@/lib/listing-expiry";
import { ListingMarketStats } from "./ListingMarketStats";
import { SmartPromoteModal } from "./SmartPromoteModal";

interface ProListingCardProps {
  listing: Listing;
  allListings: Listing[];
  buyerIntentCount?: number;
  walletBalance: number;
  autoOpenPromote?: boolean;
  onPromoteOpened?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPromote: (listingId: string, cost: number) => boolean;
  onRenew: () => void;
}

export function ProListingCard({
  listing,
  allListings,
  buyerIntentCount = 0,
  walletBalance,
  autoOpenPromote = false,
  onPromoteOpened,
  onEdit,
  onDelete,
  onPromote,
  onRenew,
}: ProListingCardProps) {
  const [promoteOpen, setPromoteOpen] = useState(false);
  const metrics = getListingMetrics(listing);
  const suggestion = getPromoteSuggestion(listing, {
    allListings,
    buyerIntentCount,
  });
  const promoteTheme = categoryToTheme(listing.category);
  const isSold = listing.status === "sold";
  const expiryLabel = formatExpiryLabel(listing);
  const expired = !isSold && !isListingActive(listing);

  useEffect(() => {
    if (autoOpenPromote && !isSold && !listing.promoted) {
      setPromoteOpen(true);
      onPromoteOpened?.();
    }
  }, [autoOpenPromote, isSold, listing.promoted, onPromoteOpened]);

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
              <span
                className={cn(
                  "absolute left-1 top-1 rounded-md px-1.5 py-0.5 text-[8px] font-bold text-white",
                  promoteTheme === "autoplius" && "bg-[#1a56db]",
                  promoteTheme === "vinted" && "bg-[#09b1a8]",
                  promoteTheme === "skelbiu" && "bg-[#1565c0]",
                  promoteTheme === "aruodas" && "bg-[#c62828]",
                  promoteTheme === "flux" && "bg-[var(--vauto-orange)]"
                )}
              >
                {promoteTheme === "vinted" ? "BUMP" : promoteTheme === "aruodas" ? "VIP" : promoteTheme === "skelbiu" ? "TOP" : "★"}
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
              <span>{metrics.callClicks} skamb.</span>
              <span>{metrics.chatStarts} pok.</span>
              <span className="flex items-center gap-0.5 text-[var(--vauto-teal)]">
                <TrendingUp className="h-3 w-3" />
                {metrics.interestScore}%
              </span>
            </div>
            <ListingMarketStats
              listing={listing}
              allListings={allListings}
              buyerIntentCount={buyerIntentCount}
              compact
            />
          </div>
        </div>

        {!isSold && !listing.promoted && (
          <button
            type="button"
            onClick={() => setPromoteOpen(true)}
            className={cn(
              "mt-3 flex w-full items-start gap-2 rounded-xl p-3 text-left transition",
              promoteTheme === "autoplius" &&
                "border border-[#1a56db]/40 bg-[#e8f0fe] hover:bg-[#dbeafe]",
              promoteTheme === "vinted" &&
                "border border-[#09b1a8]/30 bg-[#e6f7f6] hover:bg-[#d4f1ef]",
              promoteTheme === "skelbiu" &&
                "border-2 border-[#1565c0]/40 bg-[#e3f2fd] hover:bg-[#bbdefb]",
              promoteTheme === "aruodas" &&
                "border border-[#c62828]/35 bg-[#ffebee] hover:bg-[#ffcdd2]",
              promoteTheme === "flux" &&
                "border border-[var(--vauto-teal)]/30 bg-[var(--vauto-teal)]/10 hover:bg-[var(--vauto-teal)]/15"
            )}
          >
            <Sparkles
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                promoteTheme === "autoplius" && "text-[#1a56db]",
                promoteTheme === "vinted" && "text-[#09b1a8]",
                promoteTheme === "skelbiu" && "text-[#1565c0]",
                promoteTheme === "aruodas" && "text-[#c62828]",
                promoteTheme === "flux" && "text-[var(--vauto-teal)]"
              )}
            />
            <div>
              <p
                className={cn(
                  "text-xs font-semibold",
                  promoteTheme === "autoplius" && "text-[#1a56db]",
                  promoteTheme === "vinted" && "text-[#09b1a8] font-light",
                  promoteTheme === "skelbiu" && "text-[#1565c0] font-bold",
                  promoteTheme === "flux" && "text-[var(--vauto-teal)]"
                )}
              >
                {suggestion.reason}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-300">
                {suggestion.message} · {suggestion.cost.toFixed(2)}€
              </p>
              {suggestion.competitorCount > 0 && (
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {suggestion.competitorCount} konkurentai · {suggestion.expectedLift}
                </p>
              )}
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
