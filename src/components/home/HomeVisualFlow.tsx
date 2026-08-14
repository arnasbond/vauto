"use client";

import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Package,
  Sparkles,
} from "lucide-react";
import { AiInsightCard, Badge, Card } from "@/design-system";
import { cn } from "@/lib/cn";

const STEPS = [
  {
    n: "1",
    title: "Parduodu",
    text: "Parodau nuotrauką arba papasakoju. VAUTO paruošia skelbimą. Aš patikrinu ir patvirtinu.",
    icon: Camera,
    mock: (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-[var(--ds-border-strong)] bg-[var(--ds-surface-muted)] px-3 py-2.5">
        <Camera className="h-4 w-4 text-[var(--ds-ai)]" aria-hidden />
        <span className="truncate text-xs font-medium text-[var(--ds-text-muted)]">
          citroen-ds5.jpg · „Parduodu…“
        </span>
      </div>
    ),
  },
  {
    n: "2",
    title: "Perku",
    text: "Pasakau, ko ieškau. VAUTO atrenka. Palyginu ir pasirinkiu — AI nereiškia, kad pirkėjas garantuotas.",
    icon: Sparkles,
    mock: (
      <div className="mt-4 space-y-2">
        <div className="h-2 w-[80%] rounded-full bg-[var(--ds-ai)]/25" />
        <div className="h-2 w-[60%] rounded-full bg-[var(--ds-ai)]/15" />
        <Badge tone="ai" className="mt-1">
          Atrinkta palyginimui
        </Badge>
      </div>
    ),
  },
  {
    n: "3",
    title: "Sandoris",
    text: "Susitariame. VAUTO padeda aiškiai pereiti eigą: mokėjimas, Omniva, gavimas. Būsenas tvirtina serveris.",
    icon: Package,
    mock: (
      <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[var(--ds-success)]">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        Eiga matoma Deal Room
      </div>
    ),
  },
] as const;

type HomeVisualFlowProps = {
  className?: string;
  onInsightCta?: () => void;
};

/** Dinaminis 3 žingsnių AI pardavimo srautas su UI fragmentais. */
export function HomeVisualFlow({ className, onInsightCta }: HomeVisualFlowProps) {
  return (
    <section
      className={cn(
        "border-b border-[var(--ds-border-subtle,var(--vauto-border-subtle))] bg-[var(--ds-surface-page,var(--vauto-surface-soft,#f8fafc))] py-10 sm:py-12",
        className
      )}
      aria-labelledby="home-visual-flow-heading"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="ai" className="mb-3">
            Vizualus srautas
          </Badge>
          <h2
            id="home-visual-flow-heading"
            className="font-[family-name:var(--font-outfit)] text-[length:var(--ds-text-h2-size)] font-bold tracking-tight text-[var(--ds-text-primary)]"
          >
            Kaip tai veikia
          </h2>
          <p className="mt-2 text-[length:var(--ds-text-body-sm-size)] text-[var(--ds-text-muted)] sm:text-base">
            Trys keliai: parduoti, pirkti ir vesti sandorį. AI padeda — jūs
            sprendžiate.
          </p>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.n} className="relative flex">
                {index < STEPS.length - 1 ? (
                  <ArrowRight
                    className="pointer-events-none absolute -right-3 top-10 z-[1] hidden h-5 w-5 text-[var(--ds-ai)]/50 sm:block"
                    aria-hidden
                  />
                ) : null}
                <Card
                  variant="elevated"
                  className={cn(
                    "group flex w-full flex-col transition-[transform,box-shadow] duration-[180ms] ease-[var(--ds-ease)]",
                    "hover:-translate-y-[3px] hover:shadow-[var(--ds-shadow-md)]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ds-ai-soft)] text-sm font-bold text-[var(--ds-ai-strong)]">
                      {step.n}
                    </span>
                    <Icon
                      className="h-5 w-5 text-[var(--ds-ai)] transition-transform duration-[160ms] group-hover:scale-110"
                      aria-hidden
                    />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[var(--ds-text-primary)]">
                    {step.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--ds-text-muted)]">
                    {step.text}
                  </p>
                  {step.mock}
                </Card>
              </li>
            );
          })}
        </ol>

        <div className="mx-auto mt-8 max-w-2xl">
          <AiInsightCard
            title="Kainos rėžis (rekomendacija): 6 650 €"
            body="Pagal panašius Citroën C4 skelbimus tai analitinis rėžis, ne garantuota rinkos vertė ir ne automobilio būklės pažyma. Galutinę kainą nustato pardavėjas."
            ctaLabel="Pradėti su AI"
            onCta={onInsightCta}
          />
        </div>
      </div>
    </section>
  );
}
