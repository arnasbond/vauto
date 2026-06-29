"use client";

import { useCallback, useState } from "react";
import { Bot, Link2, Zap } from "lucide-react";
import { cn } from "@/lib/cn";

export const SMART_ONBOARDING_SLIDES = [
  {
    icon: Link2,
    title: "Automatinis paskyrų sinchronizavimas fone",
    body: "Sujunkite savo paskyras iš Skelbiu, Autoplius, Aruodas, Paslaugos.lt, Vinted ar Marktplaats. Sistema fone pati stebi ir atnaujina jūsų skelbimus.",
  },
  {
    icon: Bot,
    title: "Išmanusis AI agentas deryboms 24/7",
    body: "Nesvarbu, ar tai automobilis, nekilnojamasis turtas, teikiamos paslaugos, ar asmeniniai daiktai – jūsų AI dvynys profesionaliai derybose gina jūsų kainą.",
  },
  {
    icon: Zap,
    title: "0% streso, 100% efektyvumas",
    body: "Pažangus srautų valdymas ir automatizuotas pelnas tiek privatininkams, tiek verslui.",
  },
] as const;

interface SmartOnboardingCarouselProps {
  className?: string;
}

export function SmartOnboardingCarousel({ className }: SmartOnboardingCarouselProps) {
  const [index, setIndex] = useState(0);
  const slide = SMART_ONBOARDING_SLIDES[index];
  const Icon = slide.icon;

  const goTo = useCallback((next: number) => {
    setIndex((next + SMART_ONBOARDING_SLIDES.length) % SMART_ONBOARDING_SLIDES.length);
  }, []);

  return (
    <div className={cn("w-full", className)}>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-left shadow-lg backdrop-blur-sm">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--vauto-teal)] text-white shadow-md">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vauto-teal)]">
          {index + 1} / {SMART_ONBOARDING_SLIDES.length}
        </p>
        <h2 className="mt-2 text-lg font-semibold leading-snug text-white">{slide.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{slide.body}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Onboarding skaidrės">
          {SMART_ONBOARDING_SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Skaidrė ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === index ? "w-6 bg-[var(--vauto-teal)]" : "w-2 bg-white/25 hover:bg-white/40"
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          className="text-xs font-semibold text-[var(--vauto-teal)] hover:text-teal-300"
        >
          Toliau →
        </button>
      </div>
    </div>
  );
}
