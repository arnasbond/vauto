"use client";

import { Camera, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export const SELLER_LISTING_STEPS = [
  {
    n: "1",
    title: "Kategorija ar aprašymas",
    text: "Pasirinkite sritį arba laisvai aprašykite objektą / prekę. Specifiniai laukai atsiranda pagal kategoriją.",
    icon: Camera,
  },
  {
    n: "2",
    title: "AI juodraštis",
    text: "VAUTO paruošia antraštę, aprašymą ir kainos rėžį (rekomendacija).",
    icon: Sparkles,
  },
  {
    n: "3",
    title: "Jūs peržiūrite",
    text: "Pataisote faktus. AI nesiunčia skelbimo ir nepriima kainos už jus.",
    icon: Sparkles,
  },
  {
    n: "4",
    title: "Publikuojate",
    text: "Skelbimas gyvas tik po jūsų mygtuko. Žmogus sprendžia.",
    icon: CheckCircle2,
  },
] as const;

export function SellerListingSteps({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <ol
      className={cn("grid gap-2 sm:grid-cols-2", className)}
      data-seller-steps
      aria-label="Keturi skelbimo žingsniai"
    >
      {SELLER_LISTING_STEPS.map((step) => {
        const Icon = step.icon;
        return (
        <li
          key={step.n}
          className="rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-3 text-left"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {step.n} žingsnis
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--ds-text-primary)]">
            {step.title}
          </p>
          {compact ? null : (
            <p className="mt-1 text-xs leading-relaxed text-[var(--ds-text-muted)]">
              {step.text}
            </p>
          )}
        </li>
        );
      })}
    </ol>
  );
}
