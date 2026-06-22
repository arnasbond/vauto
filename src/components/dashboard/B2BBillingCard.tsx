"use client";

import { BarChart3, CreditCard } from "lucide-react";
import { B2B_PLANS, estimatePpcSpend } from "@/lib/b2b-plans";

interface B2BBillingCardProps {
  balance: number;
  clicks: number;
  callClicks: number;
  activeListings: number;
}

export function B2BBillingCard({
  balance,
  clicks,
  callClicks,
  activeListings,
}: B2BBillingCardProps) {
  const estimatedSpend = estimatePpcSpend({
    clicks,
    callClicks,
    safeBuyStarts: Math.max(0, Math.floor(callClicks * 0.4)),
  });

  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Monetizacija
          </p>
          <h2 className="text-base font-bold text-white">PPC + planai</h2>
        </div>
        <CreditCard className="h-5 w-5 text-[var(--vauto-teal)]" />
      </div>

      <div className="mb-4 rounded-xl bg-[var(--vauto-teal)]/10 p-3">
        <p className="text-xs text-slate-400">Numatomas PPC nurašymas šį mėn.</p>
        <p className="text-2xl font-bold text-[var(--vauto-teal)]">
          {estimatedSpend.toFixed(2)} €
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Balansas: {balance.toFixed(2)} € · {clicks} paspaud. · {callClicks} skamb.
        </p>
      </div>

      <div className="grid gap-2">
        {B2B_PLANS.map((plan) => (
          <div key={plan.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white">{plan.label}</p>
              <span className="text-sm font-bold text-[var(--vauto-orange)]">
                {plan.monthlyPrice} €/mėn.
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {plan.listingLimit === "unlimited"
                ? "Neriboti aktyvūs skelbimai"
                : `Iki ${plan.listingLimit} aktyvių skelbimų`}{" "}
              · dabar: {activeListings}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <BarChart3 className="h-3.5 w-3.5" />
        Verslas moka tik už rezultatą arba renkasi fiksuotą mėnesinį paketą.
      </p>
    </section>
  );
}
