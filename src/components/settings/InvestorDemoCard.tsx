"use client";

import { useState } from "react";
import { Presentation, Sparkles } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { isInvestorDemoEnabled } from "@/lib/investor-demo";
import { cn } from "@/lib/cn";

export function InvestorDemoCard() {
  const { activateInvestorDemo, investorDemoActive } = useVauto();
  const [loading, setLoading] = useState(false);

  if (!isInvestorDemoEnabled()) return null;

  const handleActivate = async () => {
    setLoading(true);
    try {
      await activateInvestorDemo();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className={cn(
        "vauto-dashboard-card rounded-2xl border p-4",
        investorDemoActive
          ? "border-[var(--vauto-orange)]/50 bg-[var(--vauto-orange)]/5"
          : "border-[var(--vauto-border)]"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Presentation className="h-5 w-5 text-[var(--vauto-orange)]" />
          <div>
            <h3 className="text-sm font-bold text-[var(--vauto-text)]">
              Investuotojų Demo
            </h3>
            <p className="text-[10px] uppercase tracking-wide text-[var(--vauto-text-muted)]">
              B2B · CV · Mokėjimai · Push
            </p>
          </div>
        </div>
        {investorDemoActive && (
          <span className="rounded-full bg-[var(--vauto-teal)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--vauto-teal)]">
            Aktyvu
          </span>
        )}
      </div>
      <p className="mb-4 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
        Akimirksniu sukuria B2B darbdavio kabinetą su sąskaitomis-faktūromis, 3 CV
        paraiškomis, realaus laiko pokalbiais ir demonstraciniais push pranešimais su
        skelbimų nuotraukomis.
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleActivate()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vauto-orange)] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        <Sparkles className="h-4 w-4" />
        {loading
          ? "Ruošiama demonstracija…"
          : investorDemoActive
            ? "Perkrauti investuotojų demo"
            : "Aktyvuoti Investuotojų Demo"}
      </button>
    </section>
  );
}
