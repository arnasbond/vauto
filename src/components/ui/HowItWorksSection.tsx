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

/** Three-step explainer block for home / marketing surfaces. */
export function HowItWorksSection({
  title = "Kaip tai veikia",
  subtitle = "Trys žingsniai — nuo minties iki skelbimo.",
  steps,
  className = "",
}: HowItWorksSectionProps) {
  return (
    <section className={`mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 ${className}`}>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-[family-name:var(--font-outfit)] text-2xl font-bold tracking-tight text-[var(--vauto-ink)] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--vauto-muted)] sm:text-base">{subtitle}</p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {steps.map((step) => (
          <article
            key={step.n}
            className="rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-6 text-left shadow-[0_1px_0_rgba(11,18,32,0.04)]"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--vauto-primary-soft)] text-sm font-bold text-[var(--vauto-primary)]">
              {step.n}
            </span>
            <h3 className="mt-4 text-base font-bold text-[var(--vauto-ink)]">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--vauto-muted)]">{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
