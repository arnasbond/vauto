"use client";

import type { LucideIcon } from "lucide-react";
import { Bot, Camera, CheckCircle2, PhoneCall, Search, Sparkles } from "lucide-react";
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
    title: "Aprašykite laisvai",
    description:
      "Rašykite savo žodžiais, pvz. „raudona sofa iki 300 € Vilniuje“",
  },
  {
    icon: Bot,
    iconClass: "text-orange-600 bg-orange-50",
    title: "DI dirba už jus",
    description:
      "Agentas supranta kontekstą ir pritaiko filtrus automatiškai",
  },
  {
    icon: CheckCircle2,
    iconClass: "text-emerald-600 bg-emerald-50",
    title: "Raskite geriausią",
    description: "Gaukite tikslius rezultatus be ilgų paieškų",
  },
];

const BUSINESS_PROPS: ValueProp[] = [
  {
    icon: Camera,
    iconClass: "text-blue-600 bg-blue-50",
    title: "Skelbimas iš nuotraukos",
    description:
      "Įkelkite nuotrauką — AI paruoš antraštę, aprašymą ir kategoriją",
  },
  {
    icon: PhoneCall,
    iconClass: "text-orange-600 bg-orange-50",
    title: "Daugiau skambučių",
    description:
      "AI optimizuoja skelbimus ir padeda gauti daugiau kvalifikuotų užklausų",
  },
  {
    icon: Sparkles,
    iconClass: "text-emerald-600 bg-emerald-50",
    title: "AI asistentas sandėliui",
    description:
      "Kurkite ir valdykite asortimentą pokalbiu — greitai ir profesionaliai",
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
