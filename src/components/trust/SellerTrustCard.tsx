"use client";

import type { Listing, UserProfile } from "@/lib/types";
import {
  isVerifiedServiceSeller,
  listingHasVerifiedProvider,
  listingHasVerifiedVin,
} from "@/lib/trust";

interface SellerTrustCardProps {
  user: UserProfile;
  listings: Listing[];
}

export function SellerTrustCard({ user, listings }: SellerTrustCardProps) {
  const myListings = listings.filter((l) => l.sellerId === user.id);
  const hasVin = myListings.some((l) => listingHasVerifiedVin(l));
  const hasProvider =
    isVerifiedServiceSeller(user.id) ||
    myListings.some((l) => listingHasVerifiedProvider(l));
  const warned = user.warned === true;

  if (!hasVin && !hasProvider && !warned) return null;

  return (
    <div className="vauto-dashboard-card mb-6 rounded-2xl p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Pasitikėjimo statusas
      </p>
      <div className="flex flex-wrap gap-2">
        {hasVin && (
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
            ✅ VIN Patikrintas pardavėjas
          </span>
        )}
        {hasProvider && (
          <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-300">
            🛡️ Verifikuotas meistras
          </span>
        )}
        {warned && (
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
            ⚠️ Gavote moderacijos įspėjimą
          </span>
        )}
      </div>
    </div>
  );
}
