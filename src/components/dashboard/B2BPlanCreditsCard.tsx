"use client";

import { useState } from "react";
import { Briefcase, Crown, Sparkles, Zap } from "lucide-react";
import {
  B2B_PLANS,
  billingPlanRank,
  jobCreditsForPlan,
  normalizeBillingPlan,
  type B2BBillingPlanId,
} from "@/lib/b2b-plans";
import { buildB2BCheckout } from "@/lib/b2b-plans";
import type { UserProfile } from "@/lib/types";
import { cn } from "@/lib/cn";

interface B2BPlanCreditsCardProps {
  user: UserProfile;
  activeJobListings: number;
  onOpenCheckout: (session: ReturnType<typeof buildB2BCheckout>) => void;
}

const PLAN_ICONS: Record<B2BBillingPlanId, typeof Briefcase> = {
  start: Briefcase,
  growth: Zap,
  enterprise: Crown,
};

export function B2BPlanCreditsCard({
  user,
  activeJobListings,
  onOpenCheckout,
}: B2BPlanCreditsCardProps) {
  const [loading, setLoading] = useState<B2BBillingPlanId | null>(null);
  const current = normalizeBillingPlan(user.billingPlan);
  const credits =
    user.jobListingCredits ??
    (current !== "free" ? jobCreditsForPlan(current as B2BBillingPlanId) : 0);

  const creditsLabel =
    credits === "unlimited"
      ? "Neriboti"
      : typeof credits === "number"
        ? String(credits)
        : "0";

  const handleSelect = (planId: B2BBillingPlanId) => {
    setLoading(planId);
    onOpenCheckout(buildB2BCheckout(planId));
    setTimeout(() => setLoading(null), 400);
  };

  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Darbdavio prenumerata
          </p>
          <h2 className="text-base font-bold text-[var(--vauto-text)]">
            Mano planas / Kreditai
          </h2>
        </div>
        <Sparkles className="h-5 w-5 text-[var(--vauto-orange)]" />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/50 p-3">
          <p className="text-xs text-[var(--vauto-text-muted)]">Aktyvus planas</p>
          <p className="mt-1 text-lg font-bold text-[var(--vauto-text)]">
            {current === "free" ? "Nėra" : current.toUpperCase()}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/50 p-3">
          <p className="text-xs text-[var(--vauto-text-muted)]">Darbo skelbimų kreditai</p>
          <p className="mt-1 text-lg font-bold text-[var(--vauto-teal)]">{creditsLabel}</p>
        </div>
        <div className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/50 p-3">
          <p className="text-xs text-[var(--vauto-text-muted)]">Aktyvūs skelbimai dabar</p>
          <p className="mt-1 text-lg font-bold text-[var(--vauto-text)]">{activeJobListings}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {B2B_PLANS.map((plan) => {
          const Icon = PLAN_ICONS[plan.id];
          const isActive = current === plan.id;
          const isUpgrade = billingPlanRank(plan.id) > billingPlanRank(current);
          const isLoading = loading === plan.id;

          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-2xl border p-4 transition",
                isActive
                  ? "border-[var(--vauto-teal)] bg-[var(--vauto-teal)]/8 ring-1 ring-[var(--vauto-teal)]"
                  : "border-[var(--vauto-border)] bg-[var(--vauto-bg)]/30"
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-[var(--vauto-orange)]" />
                <span className="font-bold text-[var(--vauto-text)]">{plan.label}</span>
              </div>
              <p className="text-2xl font-black text-[var(--vauto-orange)]">
                {plan.monthlyPrice} €
                <span className="text-sm font-normal text-[var(--vauto-text-muted)]"> / mėn.</span>
              </p>
              <ul className="mt-3 flex-1 space-y-1.5 text-xs text-[var(--vauto-text-muted)]">
                {plan.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={isActive || isLoading}
                onClick={() => handleSelect(plan.id)}
                className={cn(
                  "mt-4 w-full rounded-xl py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  isActive
                    ? "border border-[var(--vauto-teal)] text-[var(--vauto-teal)]"
                    : "bg-[var(--vauto-teal)] text-white hover:opacity-90"
                )}
              >
                {isActive
                  ? "Aktyvus planas"
                  : isLoading
                    ? "Atidaroma…"
                    : isUpgrade || current === "free"
                      ? "Pasirinkti ir apmokėti"
                      : "Keisti planą"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
