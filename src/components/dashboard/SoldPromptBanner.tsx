"use client";

import { CheckCircle, RefreshCw, X } from "lucide-react";
import type { Listing } from "@/lib/types";

interface SoldPromptBannerProps {
  listings: Listing[];
  dismissedIds: Set<string>;
  onMarkSold: (id: string) => void;
  onRenew: (id: string) => void;
  onDismiss: (id: string) => void;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function SoldPromptBanner({
  listings,
  dismissedIds,
  onMarkSold,
  onRenew,
  onDismiss,
}: SoldPromptBannerProps) {
  const candidates = listings.filter((l) => {
    if (l.status === "sold" || dismissedIds.has(l.id)) return false;
    const age = Date.now() - new Date(l.createdAt).getTime();
    return age >= SEVEN_DAYS_MS;
  });

  if (!candidates.length) return null;

  const listing = candidates[0];

  return (
    <div className="vauto-dashboard-card mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
      <p className="text-sm font-semibold text-slate-900">Ar jau pardavėte?</p>
      <p className="mt-1 text-xs text-amber-200/70">
        {listing.title} — skelbimas aktyvus 7+ dienas.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onMarkSold(listing.id)}
          className="flex w-full items-center justify-center gap-1 rounded-xl bg-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-300"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Pažymėti kaip parduotą
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onRenew(listing.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--flux-teal)]/20 py-2 text-xs font-semibold text-[var(--flux-teal)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Pratęsti nemokamai
          </button>
          <button
            type="button"
            onClick={() => onDismiss(listing.id)}
            className="flex items-center justify-center gap-1 rounded-xl bg-slate-100 px-4 py-2 text-xs text-slate-400"
          >
            <X className="h-3.5 w-3.5" />
            Vėliau
          </button>
        </div>
      </div>
    </div>
  );
}
