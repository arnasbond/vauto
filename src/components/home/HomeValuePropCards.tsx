"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  Camera,
  Package,
  Share2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type HomeValuePropVariant = "consumer" | "business";

interface ValueProp {
  icon: LucideIcon;
  iconClass: string;
  title: string;
  description: string;
}

const CONSUMER_PROPS: ValueProp[] = [
  {
    icon: Camera,
    iconClass: "text-blue-600 bg-blue-50",
    title: "Vision AI + pokalbio asistentas",
    description:
      "Įkelkite nuotrauką ar parašykite — AI sudėlioja skelbimą pokalbyje, be anketų.",
  },
  {
    icon: Sparkles,
    iconClass: "text-orange-600 bg-orange-50",
    title: "AI kainos vertintojas",
    description:
      "Prieš skelbiant matote rinkos kainos rėžį — padeda nustatyti teisingą kainą.",
  },
  {
    icon: Package,
    iconClass: "text-emerald-600 bg-emerald-50",
    title: "Omniva paštomatai",
    description:
      "Pirkimas ir siuntimas vienu paspaudimu — paštomatas, lipdukas ir saugus užsakymas.",
  },
];

const BUSINESS_PROPS: ValueProp[] = [
  {
    icon: BarChart3,
    iconClass: "text-blue-600 bg-blue-50",
    title: "B2B analitikos skydelis",
    description:
      "Realaus laiko ROI: peržiūros, kontaktai, spend vs. contacts — visa tai kabinete.",
  },
  {
    icon: Share2,
    iconClass: "text-orange-600 bg-orange-50",
    title: "9:16 Social Engine",
    description:
      "Automatiniai Stories / Reels vizualai — dalinkitės skelbimais Instagram ir TikTok.",
  },
  {
    icon: Sparkles,
    iconClass: "text-emerald-600 bg-emerald-50",
    title: "Bulk įkėlimas + aukštesnis reitingas",
    description:
      "Masinis katalogo įkėlimas ir b2bTrustBoost — Pro su logistika kyla paieškoje.",
  },
];

export function HomeValuePropCards({
  variant = "consumer",
  className,
}: {
  variant?: HomeValuePropVariant;
  className?: string;
}) {
  const props = variant === "business" ? BUSINESS_PROPS : CONSUMER_PROPS;

  return (
    <div className={cn("grid w-full gap-3 sm:grid-cols-3", className)}>
      {props.map(({ icon: Icon, iconClass, title, description }) => (
        <div
          key={title}
          className="vauto-premium-card flex flex-col gap-3 rounded-2xl bg-white p-4 text-left shadow-sm sm:p-5"
        >
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              iconClass
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Home band under HowItWorks — consumer AI value + B2B CTA (outside the hero). */
export function HomeAiValueBand({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "border-b border-[var(--vauto-border-subtle)] bg-[var(--vauto-surface-soft,#f8fafc)] py-10 sm:py-12",
        className
      )}
      aria-labelledby="home-ai-value-heading"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="home-ai-value-heading"
            className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight text-[var(--vauto-ink)] sm:text-3xl"
          >
            Kodėl VAUTO AI
          </h2>
          <p className="mt-2 text-sm text-[var(--vauto-muted)] sm:text-base">
            Trys stulpai: lengvas skelbimas pokalbiu, teisinga rinkos kaina ir
            Omniva siuntimas.
          </p>
        </div>
        <HomeValuePropCards variant="consumer" className="mt-8" />
        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-orange-200/80 bg-orange-50/60 px-5 py-4 text-center sm:flex-row sm:text-left">
          <div className="flex max-w-xl items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
              <Building2 className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">
                Verslui: analitika, Social Engine ir bulk įkėlimas
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                ROI skydelis, 9:16 Stories vizualai, masinis katalogas ir aukštesnis
                reitingas paieškoje — viskas Pro kabinete.
              </p>
            </div>
          </div>
          <Link
            href="/verslui/"
            className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700"
          >
            VAUTO verslui
          </Link>
        </div>
      </div>
    </section>
  );
}
