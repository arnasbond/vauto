"use client";

import { useState } from "react";
import { BarChart3, CreditCard, Settings2 } from "lucide-react";
import { B2B_PLANS, estimatePpcSpend, type B2BBillingPlanId } from "@/lib/b2b-plans";
import type { UserProfile } from "@/lib/types";

interface B2BBillingCardProps {
  balance: number;
  clicks: number;
  callClicks: number;
  activeListings: number;
  currentPlan?: UserProfile["billingPlan"];
  onSubscribe?: (planId: B2BBillingPlanId) => Promise<boolean>;
  onManageBilling?: () => Promise<boolean>;
  stripeEnabled?: boolean;
}

export function B2BBillingCard({
  balance,
  clicks,
  callClicks,
  activeListings,
  currentPlan = "free",
  onSubscribe,
  onManageBilling,
  stripeEnabled = false,
}: B2BBillingCardProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const estimatedSpend = estimatePpcSpend({
    clicks,
    callClicks,
    safeBuyStarts: Math.max(0, Math.floor(callClicks * 0.4)),
  });

  const hasPaidPlan = currentPlan === "starter" || currentPlan === "pro";

  const handleSubscribe = async (planId: B2BBillingPlanId) => {
    if (!onSubscribe) return;
    setLoadingPlan(planId);
    try {
      await onSubscribe(planId);
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleManage = async () => {
    if (!onManageBilling) return;
    setManaging(true);
    try {
      await onManageBilling();
    } finally {
      setManaging(false);
    }
  };

  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Monetizacija
          </p>
          <h2 className="text-base font-bold text-slate-900">PPC + planai</h2>
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

      {hasPaidPlan && stripeEnabled && onManageBilling && (
        <button
          type="button"
          disabled={managing}
          onClick={() => void handleManage()}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {managing ? "Atidaroma…" : "Valdyti prenumeratą (Stripe)"}
        </button>
      )}

      <div className="grid gap-2">
        {B2B_PLANS.map((plan) => {
          const isActive = currentPlan === plan.id;
          const isLoading = loadingPlan === plan.id;

          return (
            <div key={plan.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">{plan.label}</p>
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
                    ? stripeEnabled
                      ? "Nukreipiama į Stripe…"
                      : "Aktyvuojama…"
                    : stripeEnabled
                      ? "Mokėti per Stripe"
                      : "Užsisakyti planą (demo)"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <BarChart3 className="h-3.5 w-3.5" />
        {stripeEnabled
          ? "Mokėjimai per Stripe · atšaukimas bet kada portale."
          : "Verslas moka už rezultatą arba renkasi fiksuotą mėnesinį paketą (demo)."}
      </p>
    </section>
  );
}
