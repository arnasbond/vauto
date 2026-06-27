"use client";

import { Sparkles, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  buildWardrobeStyleBoostCheckout,
  isListingInStyleBoostFeed,
  isWardrobeSpintaEconomyActive,
} from "@/lib/monetization-wardrobe";
import type { Listing } from "@/lib/types";

const ACCENT = "#09b1a8";

interface VisibilityBoosterProps {
  listings: Listing[];
  inSpintaCabinet?: boolean;
}

export function VisibilityBooster({ listings, inSpintaCabinet = false }: VisibilityBoosterProps) {
  const { chameleonTheme, openCheckout, showToast } = useVauto();

  const clothing = useMemo(
    () => listings.filter((l) => l.category === "clothing" && l.status !== "sold"),
    [listings]
  );

  if (!isWardrobeSpintaEconomyActive(chameleonTheme, inSpintaCabinet) || clothing.length === 0) {
    return null;
  }

  const handleBoost = (listing: Listing) => {
    if (isListingInStyleBoostFeed(listing)) {
      showToast("Ši prekė jau AI stiliaus derinių sraute.", "info");
      return;
    }
    openCheckout(buildWardrobeStyleBoostCheckout(listing.id, listing.title));
  };

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-[#b8ebe8] bg-gradient-to-br from-[#fffdf9] to-[#e6f7f6] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: ACCENT }}
        >
          <TrendingUp className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-light text-[#374151]">AI matomumo stiprintuvas</p>
          <p className="text-[11px] font-light text-[#9ca3af]">
            Įtraukite prekę į asmeninių stiliaus derinių srautą — simbolinis mokestis
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {clothing.slice(0, 4).map((listing) => {
          const boosted = isListingInStyleBoostFeed(listing);
          return (
            <div
              key={listing.id}
              className="flex items-center justify-between gap-2 rounded-2xl border border-white bg-white/90 px-3 py-2.5"
            >
              <p className="min-w-0 flex-1 truncate text-sm font-light text-[#374151]">
                {listing.title}
              </p>
              <button
                type="button"
                onClick={() => handleBoost(listing)}
                disabled={boosted}
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: boosted ? "#9ca3af" : ACCENT }}
              >
                <Sparkles className="h-3 w-3" />
                {boosted ? "Aktyvu" : "1,49 €"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
