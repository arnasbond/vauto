"use client";

import { Award, Building2, MapPin, ReceiptText } from "lucide-react";
import type { UserProfile } from "@/lib/types";

export function BusinessIdentityCard({ user }: { user: UserProfile }) {
  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-orange)]/20 text-[var(--vauto-orange)]">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mano VAUTO Pro
          </p>
          <h2 className="mt-1 text-base font-bold text-white">
            {user.companyName || "Verslo paskyra"}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-slate-500">Įmonės kodas</p>
              <p className="font-semibold text-slate-200">
                {user.companyCode || "Neįvestas"}
              </p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-slate-500">PVM kodas</p>
              <p className="font-semibold text-slate-200">
                {user.vatCode || "Nebūtina"}
              </p>
            </div>
          </div>
          {user.businessType === "services" && (
            <div className="mt-3 rounded-xl bg-white/5 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <MapPin className="h-3.5 w-3.5 text-[var(--vauto-orange)]" />
                Darbo teritorija
              </p>
              <p className="text-xs text-slate-400">
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
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                <Award className="h-3.5 w-3.5" />
                Top Rated Plus suteikiamas nuo 4.8 ★ ir atsakymo iki 15 min.
              </p>
            </div>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <ReceiptText className="h-3.5 w-3.5 text-[var(--vauto-teal)]" />
            Sąskaitos-faktūros bus generuojamos automatiškai pagal šiuos duomenis.
          </p>
        </div>
      </div>
    </section>
  );
}
