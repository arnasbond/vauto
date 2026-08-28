"use client";

import { Award, Building2, MapPin, ReceiptText } from "lucide-react";
import { BusinessHoursEditor } from "@/components/dashboard/BusinessHoursEditor";
import type { UserProfile } from "@/lib/types";

export function BusinessIdentityCard({ user }: { user: UserProfile }) {
  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Mano VAUTO Pro
          </p>
          <h2 className="mt-1 text-base font-bold text-[var(--vauto-text-heading)]">
            {user.companyName?.trim() ||
              user.nickname?.trim() ||
              user.name?.trim() ||
              "VAUTO Pro"}
            <span className="ml-2 align-middle rounded-full bg-[var(--ds-brand-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">
              Pro
            </span>
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-[var(--vauto-surface-muted)] p-2">
              <p className="text-[var(--vauto-text-muted)]">Įmonės / IV kodas</p>
              <p className="font-semibold text-[var(--vauto-text-main)]">
                {user.companyCode?.trim() || "Nebūtina"}
              </p>
            </div>
            <div className="rounded-xl bg-[var(--vauto-surface-muted)] p-2">
              <p className="text-[var(--vauto-text-muted)]">PVM kodas</p>
              <p className="font-semibold text-[var(--vauto-text-main)]">
                {user.vatCode || "Nebūtina"}
              </p>
            </div>
          </div>
          {user.businessType === "services" && (
            <div className="mt-3 rounded-xl bg-[var(--vauto-surface-muted)] p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--vauto-text-main)]">
                <MapPin className="h-3.5 w-3.5 text-[var(--ds-brand)]" />
                Darbo teritorija
              </p>
              <p className="text-xs text-[var(--vauto-text-muted)]">
                {user.serviceNationwide
                  ? "Visa Lietuva"
                  : `${user.serviceBaseCity ?? "Vilnius"} · ${user.serviceRadiusKm ?? 25} km spindulys`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(user.serviceSpecialties ?? ["Remontas"]).map((specialty) => (
                  <span
                    key={specialty}
                    className="rounded-full bg-[var(--vauto-teal)]/15 px-2 py-1 text-[10px] font-semibold text-[var(--vauto-teal)]"
                  >
                    {specialty}
                  </span>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <Award className="h-3.5 w-3.5" />
                Top Rated Plus suteikiamas nuo 4.8 ★ ir atsakymo iki 15 min.
              </p>
            </div>
          )}
          <BusinessHoursEditor />
          <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--vauto-text-muted)]">
            <ReceiptText className="h-3.5 w-3.5 text-[var(--vauto-teal)]" />
            Sąskaitos-faktūros bus generuojamos automatiškai pagal šiuos duomenis.
          </p>
        </div>
      </div>
    </section>
  );
}
