"use client";

import type { Listing } from "@/lib/types";
import {
  listingHasVerifiedProvider,
  listingHasVerifiedVin,
} from "@/lib/trust";
import { jobTypeBadge } from "@/lib/jobs";

interface TrustBadgesProps {
  listing: Listing;
  size?: "sm" | "md";
}

export function TrustBadges({ listing, size = "sm" }: TrustBadgesProps) {
  const vinOk = listingHasVerifiedVin(listing);
  const providerOk = listingHasVerifiedProvider(listing);
  const jobBadge = jobTypeBadge(listing);

  if (!vinOk && !providerOk && !jobBadge) return null;

  const cls =
    size === "sm"
      ? "text-[10px] px-2 py-0.5"
      : "text-xs px-2.5 py-1";

  return (
    <div className="flex flex-wrap gap-1.5">
      {jobBadge && (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-[var(--ds-ai-soft)] font-medium text-[var(--ds-ai-strong)] ring-1 ring-[var(--ds-ai)]/25 ${cls}`}
        >
          {jobBadge}
        </span>
      )}
      {vinOk && (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/30 ${cls}`}
        >
          ✅ VIN Patikrintas
        </span>
      )}
      {providerOk && (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-[var(--ds-brand-soft)] font-medium text-[var(--ds-brand)] ring-1 ring-[var(--ds-brand)]/30 ${cls}`}
        >
          🛡️ Verifikuotas meistras
        </span>
      )}
    </div>
  );
}
