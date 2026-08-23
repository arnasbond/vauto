"use client";

import type { Listing, UserProfile } from "@/lib/types";
import {
  isVerifiedServiceProvider,
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
    isVerifiedServiceProvider(user) ||
    myListings.some((l) => listingHasVerifiedProvider(l));
  const warned = user.warned === true;

  if (!hasVin && !hasProvider && !warned) return null;

  return (
    <div className="vauto-dashboard-card mb-6 rounded-2xl p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
        Pasitikėjimo statusas
      </p>
      <div className="flex flex-wrap gap-2">
        {hasVin && (
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
            ✅ VIN Patikrintas pardavėjas
          </span>
        )}
        {hasProvider && (
          <span className="rounded-full bg-[var(--ds-brand-soft)] px-3 py-1 text-xs font-medium text-[var(--ds-brand)]">
            🛡️ Verifikuotas meistras
          </span>
        )}
        {warned && (
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-300">
            ⚠️ Gavote moderacijos įspėjimą
          </span>
        )}
      </div>
    </div>
  );
}
