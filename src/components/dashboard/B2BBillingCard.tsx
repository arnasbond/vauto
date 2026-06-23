"use client";

import { useState } from "react";
import { BarChart3, CreditCard } from "lucide-react";
import { B2B_PLANS, estimatePpcSpend, type B2BBillingPlanId } from "@/lib/b2b-plans";
import type { UserProfile } from "@/lib/types";

interface B2BBillingCardProps {
  balance: number;
  clicks: number;
  callClicks: number;
  activeListings: number;
  currentPlan?: UserProfile["billingPlan"];
  onSubscribe?: (planId: B2BBillingPlanId) => Promise<boolean>;
}

export function B2BBillingCard({
  balance,
  clicks,
  callClicks,
  activeListings,
  currentPlan = "free",
  onSubscribe,
}: B2BBillingCardProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const estimatedSpend = estimatePpcSpend({
    clicks,
    callClicks,
    safeBuyStarts: Math.max(0, Math.floor(callClicks * 0.4)),
  });

  const handleSubscribe = async (planId: B2BBillingPlanId) => {
    if (!onSubscribe) return;
    setLoadingPlan(planId);
    try {
      await onSubscribe(planId);
    } finally {
      setLoadingPlan(null);
    }
  };

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
        {B2B_PLANS.map((plan) => {
          const isActive = currentPlan === plan.id;
          const isLoading = loadingPlan === plan.id;

          return (
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
              <button
                type="button"
                disabled={isActive || isLoading || !onSubscribe}
                onClick={() => void handleSubscribe(plan.id)}
                className="mt-2 w-full rounded-lg border border-[var(--vauto-teal)]/40 py-2 text-xs font-semibold text-[var(--vauto-teal)] hover:bg-[var(--vauto-teal)]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isActive
                  ? "Aktyvus planas"
                  : isLoading
                    ? "Aktyvuojama…"
                    : "Užsisakyti planą"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <BarChart3 className="h-3.5 w-3.5" />
        Verslas moka tik už rezultatą arba renkasi fiksuotą mėnesinį paketą.
      </p>
    </section>
  );
}
