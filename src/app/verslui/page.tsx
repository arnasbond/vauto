"use client";

import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { HomeValuePropCards } from "@/components/home/HomeValuePropCards";
import { useAuth } from "@/context/AuthContext";

export default function VersluiPage() {
  const { isAuthenticated, openAuthModal } = useAuth();

  return (
    <VautoAdaptiveLayout variant="plain">
      <div className="mx-auto w-full max-w-lg px-4 md:max-w-7xl md:px-0">
        <div className="flex flex-col items-center py-6 text-center md:items-start md:py-8 md:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-orange-600">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            VAUTO VERSLUI
          </span>

          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:max-w-3xl">
            Verslo skelbimai. Valdomi DI.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            VAUTO verslo kabinetas — automatinis importas, AI optimizuoti skelbimai
            ir daugiau kvalifikuotų užklausų jūsų įmonei visoje Lietuvoje.
          </p>

          <HomeValuePropCards variant="business" className="mt-8 w-full" />

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            {isAuthenticated ? (
              <Link
                href="/pro-registration/"
                className="inline-flex items-center gap-2 rounded-2xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-orange-700"
              >
                Registruoti verslą
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal("/verslui")}
                className="inline-flex items-center gap-2 rounded-2xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-orange-700"
              >
                Pradėti nemokamai
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <Link
              href="/profile/"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
            >
              Atidaryti kabinetą
            </Link>
          </div>
        </div>
      </div>
    </VautoAdaptiveLayout>
  );
}
