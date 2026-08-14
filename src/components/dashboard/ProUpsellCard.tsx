"use client";

import Link from "next/link";
import { Building2, Sparkles } from "lucide-react";

export function ProUpsellCard() {
  return (
    <section className="vauto-dashboard-card mb-4 rounded-2xl border border-[var(--vauto-orange)]/30 bg-gradient-to-br from-[var(--vauto-orange)]/10 to-transparent p-4">
      <div className="mb-2 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-[var(--vauto-orange)]" />
        <h3 className="text-sm font-semibold text-slate-900">Verslo paskyra</h3>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        Kabineto statistika, dalijimosi vizualai ir masinis katalogo įkėlimas.
        Privatus pardavėjas gali bet kada pereiti į Pro.
      </p>
      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        <li className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-[var(--vauto-teal)]" />
          Peržiūros ir kontaktai verslo kabinete
        </li>
        <li className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-[var(--vauto-teal)]" />
          9:16 formato vizualai ir Omniva logistika sandorio kambaryje
        </li>
      </ul>
      <Link
        href="/profile/?upgrade=pro"
        className="mt-4 flex w-full items-center justify-center rounded-xl bg-[var(--vauto-orange)] py-3 text-sm font-semibold text-white hover:opacity-90"
      >
        Sužinoti apie Pro
      </Link>
    </section>
  );
}
