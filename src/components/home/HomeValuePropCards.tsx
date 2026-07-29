"use client";

import type { LucideIcon } from "lucide-react";
import { Building2, Camera, CheckCircle2, PhoneCall, Search, Sparkles } from "lucide-react";
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
    icon: Search,
    iconClass: "text-blue-600 bg-blue-50",
    title: "Ieškokite laisvai",
    description:
      "Parašykite „raudona sofa iki 300 € Vilniuje“ — AI filtruoja skelbimus be formų.",
  },
  {
    icon: Camera,
    iconClass: "text-orange-600 bg-orange-50",
    title: "Parduokite iš nuotraukos",
    description:
      "Įkelkite foto — AI parašo antraštę, kainos intervalą ir aprašymą per minutes.",
  },
  {
    icon: CheckCircle2,
    iconClass: "text-emerald-600 bg-emerald-50",
    title: "Skambutis tiesiai",
    description:
      "Be tarpininkų — susisiekite su pardavėju, kai pasiūlymas tinka.",
  },
];

const BUSINESS_PROPS: ValueProp[] = [
  {
    icon: Camera,
    iconClass: "text-blue-600 bg-blue-50",
    title: "Masinis įkėlimas",
    description:
      "Drabužiai, auto detalės, smulki technika — kelios nuotraukos, daug juodraščių.",
  },
  {
    icon: PhoneCall,
    iconClass: "text-orange-600 bg-orange-50",
    title: "Daugiau kvalifikuotų kontaktų",
    description:
      "AI optimizuoja skelbimus, kad pirkėjai rastų jus greičiau visoje Lietuvoje.",
  },
  {
    icon: Sparkles,
    iconClass: "text-emerald-600 bg-emerald-50",
    title: "Verslo kabinetas",
    description:
      "Asortimentas, paketinis publikavimas ir AI asistentas — valdomi pokalbiu.",
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
            Viena pokalbio juosta — paieška, pardavimas ir verslo katalogas.
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
                Verslui: masinis įkėlimas ir AI kabinetas
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                Auto detalės, mada, smulki technika — keliate krepšelį, AI ruošia
                juodraščius, jūs patvirtinate paketą.
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
