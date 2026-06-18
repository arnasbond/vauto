"use client";

import type { Listing } from "@/lib/types";
import {
  listingHasVerifiedProvider,
  listingHasVerifiedVin,
} from "@/lib/trust";

interface TrustBadgesProps {
  listing: Listing;
  size?: "sm" | "md";
}

export function TrustBadges({ listing, size = "sm" }: TrustBadgesProps) {
  const vinOk = listingHasVerifiedVin(listing);
  const providerOk = listingHasVerifiedProvider(listing);

  if (!vinOk && !providerOk) return null;

  const cls =
    size === "sm"
      ? "text-[10px] px-2 py-0.5"
      : "text-xs px-2.5 py-1";

  return (
    <div className="flex flex-wrap gap-1.5">
      {vinOk && (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 font-medium text-emerald-700 ring-1 ring-emerald-200 ${cls}`}
        >
          ✅ VIN Patikrintas
        </span>
      )}
      {providerOk && (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-blue-50 font-medium text-blue-700 ring-1 ring-blue-200 ${cls}`}
        >
          🛡️ Verifikuotas meistras
        </span>
      )}
    </div>
  );
}
