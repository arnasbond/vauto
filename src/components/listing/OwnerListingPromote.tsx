"use client";

import { useState } from "react";
import { Sparkles, TrendingUp } from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import { ListingMarketStats } from "@/components/dashboard/ListingMarketStats";
import { SmartPromoteModal } from "@/components/dashboard/SmartPromoteModal";
import { getPromoteSuggestion, resolveSelectedPlan } from "@/lib/smart-promote";
import type { Listing } from "@/lib/types";
import type { VisibilityTierId } from "@/lib/visibility-plans";
import { useVauto } from "@/context/VautoContext";

interface OwnerListingPromoteProps {
  listing: Listing;
}

export function OwnerListingPromote({ listing }: OwnerListingPromoteProps) {
  const { listings, user, buyerIntentCount, promoteListing } = useVauto();
  const [open, setOpen] = useState(false);

  if (listing.status === "sold") return null;

  const suggestion = getPromoteSuggestion(listing, {
    allListings: listings,
    buyerIntentCount,
    user,
  });
  const selectedPlan = resolveSelectedPlan(suggestion);

  return (
    <section className="vauto-glass-card rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h2 className="text-sm font-semibold text-slate-900">Padidinti matomumą</h2>
      </div>
      <ListingMarketStats
        listing={listing}
        allListings={listings}
        buyerIntentCount={buyerIntentCount}
        compact
      />
      <p className="mt-2 text-xs text-slate-400">
        Rekomenduojamas planas:{" "}
        <span className="font-medium text-white">{selectedPlan.label}</span> ·{" "}
        {formatPrice(selectedPlan.price)}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-teal)] py-3 text-sm font-semibold text-white"
      >
        <Sparkles className="h-4 w-4" />
        Reklamuoti skelbimą
      </button>

      <SmartPromoteModal
        open={open}
        listing={listing}
        suggestion={suggestion}
        walletBalance={user.walletBalance ?? 0}
        onClose={() => setOpen(false)}
        onConfirm={(tierId: VisibilityTierId, cost: number) =>
          promoteListing(listing.id, cost, tierId)
        }
      />
    </section>
  );
}
