"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Layers,
  Share2,
  TrendingUp,
} from "lucide-react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { HomeValuePropCards } from "@/components/home/HomeValuePropCards";
import { useAuth } from "@/context/AuthContext";

const B2B_PILLARS = [
  {
    icon: BarChart3,
    title: "Realaus laiko B2B analitika",
    text: "ROI skydelis: peržiūros, telefonų paspaudimai, kontaktai ir spend vs. contacts — be demo seedų.",
  },
  {
    icon: Share2,
    title: "Automated 9:16 Social Engine",
    text: "Stories / Reels vizualai vienu bakstelėjimu — dalinkitės skelbimais Instagram, TikTok ir FB.",
  },
  {
    icon: Layers,
    title: "Multi-įkėlimas (Bulk loader)",
    text: "Kelios nuotraukos → daug juodraščių. Katalogą valdote greičiau nei rankiniu pildymu.",
  },
  {
    icon: TrendingUp,
    title: "Aukštesnis reitingas paieškoje",
    text: "b2bTrustBoost — patvirtinti Pro su aktyvia Omniva logistika kyla feed'e prieš paprastus skelbimus.",
  },
] as const;

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
            Verslo kabinetas su analitika, Social Engine ir bulk įkėlimu
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            Realaus laiko ROI skydelis, automatiniai 9:16 Stories vizualai, masinis
            katalogo įkėlimas ir aukštesnis reitingas paieškoje — viskas Pro verslo
            klientams visoje Lietuvoje.
          </p>

          <HomeValuePropCards variant="business" className="mt-8 w-full" />

          <section
            className="mt-10 w-full text-left"
            aria-labelledby="verslui-pillars-heading"
          >
            <h2
              id="verslui-pillars-heading"
              className="text-center text-lg font-bold text-slate-900 md:text-left"
            >
              Ką gauna Pro verslas
            </h2>
            <p className="mt-1 text-center text-sm text-slate-600 md:text-left">
              Keturi įrankiai, kurie skiria VAUTO verslo kabinetą nuo paprastos skelbimų
              lentos.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {B2B_PILLARS.map(({ icon: Icon, title, text }) => (
                <li
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        {text}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

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
