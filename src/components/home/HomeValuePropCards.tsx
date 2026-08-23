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
import { Badge, Button, Card } from "@/design-system";
import { cn } from "@/lib/cn";

export type HomeValuePropVariant = "consumer" | "business";

interface ValueProp {
  icon: LucideIcon;
  tone: "ai" | "brand" | "success";
  title: string;
  description: string;
}

const CONSUMER_PROPS: ValueProp[] = [
  {
    icon: Camera,
    tone: "brand",
    title: "Skelbimas iš nuotraukos ar sakinio",
    description:
      "VAUTO paruošia juodraštį pokalbyje. Publikuojate tik jūs — AI nesiunčia skelbimo už jus.",
  },
  {
    icon: Sparkles,
    tone: "ai",
    title: "Kainos rėžis ir palyginimas",
    description:
      "VAUTO Score ir kainos rėžis yra analitinė rekomendacija, ne garantuota rinkos kaina.",
  },
  {
    icon: Package,
    tone: "success",
    title: "Sandorio eiga, ne tik skelbimas",
    description:
      "Platformos saugumo mechanizmai, jų ribos ir sąlygos: mokėjimas laikomas iki gavimo. Būsenas tvirtina serveris — objektą ir susitarimą tvirtinate jūs.",
  },
];

const BUSINESS_PROPS: ValueProp[] = [
  {
    icon: BarChart3,
    tone: "brand",
    title: "Kabineto statistika",
    description:
      "Peržiūros ir kontaktai verslo kabinete. Tai pagalba palyginimui, ne garantuotas pardavimas.",
  },
  {
    icon: Share2,
    tone: "ai",
    title: "Dalijimosi vizualai",
    description:
      "9:16 formato vaizdai, kad galėtumėte patys dalintis skelbimu. Publikaciją ir dalijimąsi tvirtinate jūs.",
  },
  {
    icon: Sparkles,
    tone: "success",
    title: "Masinis katalogo įkėlimas",
    description:
      "Pro paskyra gali kelti kelis skelbimus. Matomumas kyla iš patvirtintų atsiliepimų ir logistikos, ne iš slaptų reitingo kodų.",
  },
];

const TONE_ICON: Record<ValueProp["tone"], string> = {
  brand: "bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]",
  ai: "bg-[var(--ds-ai-soft)] text-[var(--ds-ai)]",
  success: "bg-[var(--ds-success-soft)] text-[var(--ds-success)]",
};

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
      {props.map(({ icon: Icon, tone, title, description }) => (
        <Card
          key={title}
          variant="interactive"
          className={cn(
            "flex flex-col gap-3 text-left",
            "transition-[transform,box-shadow] duration-[180ms] ease-[var(--ds-ease)]",
            "hover:-translate-y-[3px] hover:shadow-[var(--ds-shadow-md)]"
          )}
        >
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              TONE_ICON[tone]
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--ds-text-primary)]">
              {title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ds-text-muted)]">
              {description}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Home band under visual flow — consumer AI value + B2B CTA. */
export function HomeAiValueBand({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "border-b border-[var(--ds-border-subtle,var(--vauto-border-subtle))] bg-[var(--ds-surface-card,#fff)] py-10 sm:py-12",
        className
      )}
      aria-labelledby="home-ai-value-heading"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="premium" className="mb-3">
            Vertė
          </Badge>
          <h2
            id="home-ai-value-heading"
            className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight text-[var(--ds-text-primary)] sm:text-3xl"
          >
            Kodėl ne tik skelbimų lenta
          </h2>
          <p className="mt-2 text-sm text-[var(--ds-text-muted)] sm:text-base">
            VAUTO veda nuo juodraščio iki sandorio eigos. AI padeda — žmogus
            sprendžia.
          </p>
        </div>
        <HomeValuePropCards variant="consumer" className="mt-8" />
        <Card
          variant="elevated"
          className="mt-8 flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left"
        >
          <div className="flex max-w-xl items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]">
              <Building2 className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold text-[var(--ds-text-primary)]">
                Verslui: statistika, dalijimosi vizualai ir masinis įkėlimas
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--ds-text-muted)] sm:text-sm">
                Kabineto peržiūros, 9:16 formato vaizdai ir masinis katalogas —
                Pro kabinete. AI padeda, žmogus sprendžia.
              </p>
            </div>
          </div>
          <Link href="/verslui/" className="shrink-0">
            <Button variant="primary" size="md">
              VAUTO verslui
            </Button>
          </Link>
        </Card>
      </div>
    </section>
  );
}
