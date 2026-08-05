import { Card } from "@/design-system";
import { cn } from "@/lib/cn";

export type HowItWorksStep = {
  n: string;
  title: string;
  text: string;
};

type HowItWorksSectionProps = {
  title?: string;
  subtitle?: string;
  steps: HowItWorksStep[];
  className?: string;
};

/** Three-step explainer block for home / marketing surfaces (DS cards). */
export function HowItWorksSection({
  title = "Kaip tai veikia",
  subtitle = "Trys žingsniai — nuo minties iki skelbimo.",
  steps,
  className = "",
}: HowItWorksSectionProps) {
  return (
    <section
      className={cn(
        "mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16",
        className
      )}
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight text-[var(--ds-text-primary,var(--vauto-ink))] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--ds-text-muted,var(--vauto-muted))] sm:text-base">
          {subtitle}
        </p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {steps.map((step) => (
          <Card
            key={step.n}
            variant="interactive"
            className="text-left transition-[transform,box-shadow] duration-[180ms] ease-[var(--ds-ease)] hover:-translate-y-[3px] hover:shadow-[var(--ds-shadow-md)]"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ds-ai-soft,var(--vauto-primary-soft))] text-sm font-bold text-[var(--ds-ai-strong,var(--vauto-primary))]">
              {step.n}
            </span>
            <h3 className="mt-4 text-base font-bold text-[var(--ds-text-primary,var(--vauto-ink))]">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ds-text-muted,var(--vauto-muted))]">
              {step.text}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
