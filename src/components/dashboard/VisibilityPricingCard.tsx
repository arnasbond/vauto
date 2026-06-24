"use client";

import { Shield } from "lucide-react";
import { getCategoryLabel } from "@/lib/listing-display";
import { VISIBILITY_POLICY_SUMMARY, getVisibilityPlans } from "@/lib/visibility-plans";
import type { Listing, ListingCategory, UserProfile } from "@/lib/types";

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
  const active = listings.filter((l) => l.status !== "sold");
  if (!active.length) return null;

  const byCategory = new Map<ListingCategory, Listing>();
  for (const listing of active) {
    if (!byCategory.has(listing.category)) byCategory.set(listing.category, listing);
  }

  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-slate-900">Matomumo kainodara</h3>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">
        {VISIBILITY_POLICY_SUMMARY.join(" ")}
      </p>

      <div className="space-y-4">
        {[...byCategory.entries()].map(([category, sampleListing]) => {
          const plans = getVisibilityPlans(sampleListing, allListings, user);
          return (
            <div key={category}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {getCategoryLabel(sampleListing)} · pavyzdys: {sampleListing.title.slice(0, 36)}
              </p>
              <div className="space-y-2">
                {plans.map((plan) => (
                  <div
                    key={`${category}-${plan.id}`}
                    className={`rounded-xl border p-3 ${
                      plan.available
                        ? "border-slate-200 bg-white/[0.03]"
                        : "border-white/5 bg-white/[0.02] opacity-70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
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
                      <p className="mt-1 text-[10px] text-amber-400">
                        {plan.unavailableReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
