"use client";

import { useState } from "react";
import { Sparkles, TrendingUp } from "lucide-react";
import { ListingMarketStats } from "@/components/dashboard/ListingMarketStats";
import { SmartPromoteModal } from "@/components/dashboard/SmartPromoteModal";
import { B2C_PROMOTE_PRODUCTS } from "@/lib/monetization-catalog";
import type { Listing } from "@/lib/types";
import { useVauto } from "@/context/VautoContext";

interface OwnerListingPromoteProps {
  listing: Listing;
}

export function OwnerListingPromote({ listing }: OwnerListingPromoteProps) {
  const { listings, buyerIntentCount, openCheckout } = useVauto();
  const [open, setOpen] = useState(false);

  if (listing.status === "sold") return null;

  const fromPrice = B2C_PROMOTE_PRODUCTS[0].priceEur;

  return (
    <section className="vauto-glass-card rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h2 className="text-sm font-semibold text-[var(--vauto-text)]">Padidinti matomumą</h2>
      </div>
      <ListingMarketStats
        listing={listing}
        allListings={listings}
        buyerIntentCount={buyerIntentCount}
        compact
      />
      <p className="mt-2 text-xs text-[var(--vauto-text-muted)]">
        Iškėlimas nuo {fromPrice.toFixed(2)} € · saugus VAUTO Checkout
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-teal)] py-3 text-sm font-semibold text-white"
      >
        <Sparkles className="h-4 w-4" />
        Iškelti skelbimą
      </button>

      <SmartPromoteModal
        open={open}
        listing={listing}
        onClose={() => setOpen(false)}
        onOpenCheckout={openCheckout}
      />
    </section>
  );
}
