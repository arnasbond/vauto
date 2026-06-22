"use client";

import { Search, Sparkles } from "lucide-react";

interface BuyerIntentBannerProps {
  intentCount: number;
}

export function BuyerIntentBanner({ intentCount }: BuyerIntentBannerProps) {
  if (intentCount <= 0) return null;

  return (
    <div className="vauto-dashboard-card mb-4 flex items-start gap-3 rounded-2xl border border-[var(--flux-teal)]/20 p-4">
      <Search className="mt-0.5 h-5 w-5 shrink-0 text-[var(--flux-teal)]" />
      <div>
        <p className="text-sm font-semibold text-white">
          VAUTO brokeris rado {intentCount} pirkėj
          {intentCount === 1 ? "ą" : "us"} jūsų skelbimų kategorijoms
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Tuščios ir silpnos paieškos paverčiamos paklausa — laikykite skelbimus
          aktyvius ir greitai atsakykite į žinutes.
        </p>
      </div>
      <Sparkles className="h-4 w-4 shrink-0 text-[var(--flux-coral)]" />
    </div>
  );
}
