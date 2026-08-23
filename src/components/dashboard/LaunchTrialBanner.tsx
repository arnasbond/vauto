"use client";

import { Gift } from "lucide-react";
import {
  LAUNCH_PROMO_BADGE,
  LAUNCH_PROMO_SHORT,
  LAUNCH_PROMO_TITLE,
  isLaunchPromoActive,
  isLaunchPromoExpired,
  launchPromoDaysRemaining,
} from "@vauto/shared/launch-promo";
import { normalizeBillingPlan } from "@/lib/b2b-plans";
import type { UserProfile } from "@/lib/types";

interface LaunchTrialBannerProps {
  user: UserProfile;
}

export function LaunchTrialBanner({ user }: LaunchTrialBannerProps) {
  if (!isLaunchPromoActive()) return null;

  const plan = normalizeBillingPlan(user.billingPlan);
  const expiresAt = user.billingExpiresAt;
  const hasActivePaidPlan = plan !== "free";
  const expired = isLaunchPromoExpired(expiresAt);
  const daysLeft = launchPromoDaysRemaining(expiresAt);

  if (hasActivePaidPlan && expiresAt && !expired) {
    return (
      <section className="mb-4 rounded-2xl border border-[var(--ds-warning)]/30 bg-[var(--ds-warning-soft)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-warning)]/15 text-[var(--ds-warning)]">
            <Gift className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-warning)]">
              {LAUNCH_PROMO_TITLE}
            </p>
            <h2 className="mt-0.5 text-base font-bold text-[var(--vauto-text)]">
              Aktyvus 3 mėn. nemokamas periodas
            </h2>
            <p className="mt-1 text-sm text-[var(--vauto-text-muted)]">
              Planas{" "}
              <span className="font-semibold text-[var(--vauto-text)]">
                {plan.toUpperCase()}
              </span>
              {" · "}
              Liko{" "}
              <span className="font-bold text-[var(--ds-warning)]">
                {daysLeft} {daysLeft === 1 ? "diena" : "d."}
              </span>
              {" · "}
              {LAUNCH_PROMO_BADGE}
            </p>
            <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
              Kortelės nereikia. Po periodo galėsite tęsti su{" "}
              {plan === "start" ? "9" : plan === "growth" ? "29" : "69"} € / mėn.
              arba keisti planą.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (expired && expiresAt) {
    return (
      <section className="mb-4 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/60 p-4">
        <p className="text-sm font-semibold text-[var(--vauto-text)]">
          Nemokamas Starto periodas baigėsi
        </p>
        <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
          Pasirinkite planą ir tęskite su bazinėmis kainomis — limitai išlieka pagal
          START / GROWTH / ENTERPRISE.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-2xl border border-[var(--ds-warning)]/25 bg-gradient-to-br from-[var(--ds-warning-soft)] to-transparent p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-warning)]/15 text-[var(--ds-warning)]">
          <Gift className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-warning)]">
            {LAUNCH_PROMO_TITLE}
          </p>
          <h2 className="mt-0.5 text-base font-bold text-[var(--vauto-text)]">
            {LAUNCH_PROMO_SHORT} visiems planams
          </h2>
          <p className="mt-1 text-sm text-[var(--vauto-text-muted)]">
            START 9 € · GROWTH 29 € · ENTERPRISE 69 € / mėn. — šiandien{" "}
            <span className="font-bold text-[var(--ds-warning)]">
              {LAUNCH_PROMO_BADGE}
            </span>
            , be banko kortelės. Planų limitai galioja iškart.
          </p>
        </div>
      </div>
    </section>
  );
}
