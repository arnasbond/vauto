"use client";

import { Shield } from "lucide-react";
import { VISIBILITY_POLICY_SUMMARY } from "@/lib/visibility-plans";
import type { Listing } from "@/lib/types";
import { getVisibilityPlans } from "@/lib/visibility-plans";
import type { UserProfile } from "@/lib/types";

interface VisibilityPricingCardProps {
  listings: Listing[];
  allListings: Listing[];
  user: UserProfile;
}

export function VisibilityPricingCard({
  listings,
  allListings,
  user,
}: VisibilityPricingCardProps) {
  const sampleListing = listings.find((l) => l.status !== "sold") ?? listings[0];
  if (!sampleListing) return null;

  const plans = getVisibilityPlans(sampleListing, allListings, user);

  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-white">Matomumo kainodara</h3>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">
        {VISIBILITY_POLICY_SUMMARY.join(" ")}
      </p>
      <div className="space-y-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border p-3 ${
              plan.available
                ? "border-white/10 bg-white/[0.03]"
                : "border-white/5 bg-white/[0.02] opacity-70"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-white">
                  {plan.label}
                  {plan.recommended && (
                    <span className="ml-1.5 text-[9px] font-normal text-[var(--vauto-orange)]">
                      rekomenduojama
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {plan.durationDays} d. · {plan.feedPosition}
                  {plan.maxSlotsPerRegion !== "unlimited" &&
                    ` · max ${plan.maxSlotsPerRegion} vietos`}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold text-[var(--vauto-orange)]">
                nuo {plan.price.toFixed(2)} €
              </p>
            </div>
            {!plan.available && plan.unavailableReason && (
              <p className="mt-1 text-[10px] text-amber-400">{plan.unavailableReason}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
